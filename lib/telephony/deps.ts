// Perakitan dependensi — di sinilah Supabase disambungkan.
import type { ManualDeps } from './adapters/manual';
import type { PbxDeps } from './adapters/pbx';
import { normalisasiNomor } from './phone';
import { createServiceRoleClient } from '@/lib/supabase/service';

// Service-role client — mitra tidak punya akses ke call_sessions,
// call_recordings, device_log_imports secara sengaja (lihat RLS di
// 0002_telephony.sql). Tabel-tabel ini HANYA boleh ditulis dari sini.
export async function buatManualDeps(): Promise<ManualDeps> {
  const supabase = createServiceRoleClient();

  return {
    async ambilNomorDikenal() {
      const { data, error } = await supabase.from('contacts').select('no_hp');
      if (error) throw new Error(`ambilNomorDikenal: ${error.message}`);

      const set = new Set<string>();
      for (const row of data ?? []) {
        const n = normalisasiNomor(row.no_hp);
        if (n) set.add(n);
      }
      return set;
    },

    async ambilSesiHari(agentId, tanggal) {
      const { data, error } = await supabase
        .from('call_sessions')
        .select('id, phone_e164, started_at')
        .eq('agent_id', agentId)
        .gte('started_at', `${tanggal}T00:00:00+07:00`)
        .lte('started_at', `${tanggal}T23:59:59+07:00`);
      if (error) throw new Error(`ambilSesiHari: ${error.message}`);

      return (data ?? []).map((d) => ({
        id: d.id as string,
        phoneE164: d.phone_e164 as string,
        startedAt: new Date(d.started_at as string),
      }));
    },

    async simpanSesi(rows) {
      if (rows.length === 0) return { dibuat: 0, diperbarui: 0 };

      const agentId = rows[0]!.agentId;
      const { data: existing, error: exErr } = await supabase
        .from('call_sessions')
        .select('phone_e164, started_at')
        .eq('agent_id', agentId)
        .eq('source', 'manual');
      if (exErr) throw new Error(`simpanSesi (cek existing): ${exErr.message}`);

      // Perbandingan string timestamp bisa meleset kalau format berbeda
      // (mis. offset +00:00 vs Z) — dibuat/diperbarui di sini statistik
      // saja untuk laporan, bukan penegak dedup. Dedup sesungguhnya
      // dijamin oleh unique index idx_cs_manual_dedup di database.
      const existingKeys = new Set(
        (existing ?? []).map(
          (e) => `${e.phone_e164}|${new Date(e.started_at as string).toISOString()}`
        )
      );

      const payload = rows.map((r) => ({
        agent_id: r.agentId,
        phone_e164: r.phoneE164,
        started_at: r.startedAt.toISOString(),
        talk_time_detik: r.durasiDetik,
        outcome: r.outcome,
        source: 'manual' as const,
        verified: true,
        verified_by: 'device_log' as const,
      }));

      let dibuat = 0;
      let diperbarui = 0;
      for (const p of payload) {
        const key = `${p.phone_e164}|${p.started_at}`;
        if (existingKeys.has(key)) diperbarui++;
        else dibuat++;
      }

      const { error } = await supabase
        .from('call_sessions')
        .upsert(payload, { onConflict: 'agent_id,phone_e164,started_at' });
      if (error) throw new Error(`simpanSesi (upsert): ${error.message}`);

      return { dibuat, diperbarui };
    },

    async simpanRekaman(rows) {
      if (rows.length === 0) return;

      const payload = rows.map((r) => ({
        agent_id: r.agentId,
        storage_path: r.storagePath,
        call_session_id: r.sessionId,
        parsed_phone_e164: r.parsedPhone,
        parsed_started_at: r.parsedStartedAt ? r.parsedStartedAt.toISOString() : null,
        match_confidence: r.confidence,
        match_delta_detik: r.deltaDetik,
        ukuran_bytes: r.ukuranBytes,
      }));

      const { error } = await supabase.from('call_recordings').insert(payload);
      if (error) throw new Error(`simpanRekaman: ${error.message}`);
    },

    async catatImpor(row) {
      const { error } = await supabase.from('device_log_imports').upsert(
        {
          agent_id: row.agentId,
          tanggal: row.tanggal,
          baris_total: row.barisTotal,
          baris_relevan: row.barisRelevan,
          baris_dibuang: row.barisDibuang,
          rekaman_diunggah: row.rekamanDiunggah,
          status: row.status,
          catatan_error: row.catatanError ?? null,
        },
        { onConflict: 'agent_id,tanggal' }
      );
      if (error) throw new Error(`catatImpor: ${error.message}`);
    },

    async signedUrl(storagePath) {
      const { data, error } = await supabase.storage
        .from('call-recordings')
        .createSignedUrl(storagePath, 3600);
      if (error) return null;
      return data?.signedUrl ?? null;
    },

    async storagePathSesi(sessionId) {
      const { data, error } = await supabase
        .from('call_recordings')
        .select('storage_path')
        .eq('call_session_id', sessionId)
        .maybeSingle();
      if (error || !data) return null;
      return data.storage_path as string;
    },

    async toleransiCocokDetik() {
      const { data } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'telephony_match_toleransi')
        .maybeSingle();
      const v = data ? parseInt(data.value as string, 10) : NaN;
      return Number.isFinite(v) ? v : 120;
    },
  };
}

export async function buatPbxDeps(): Promise<PbxDeps> {
  throw new Error('TODO: rakit PbxDeps saat pindah ke PBX');
}
