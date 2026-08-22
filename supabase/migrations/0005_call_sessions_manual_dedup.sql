-- Kunci dedup untuk upload harian: unggah ulang CSV hari yang sama
-- tidak boleh menggandakan baris call_sessions. Diperlukan supaya
-- ManualDeps.simpanSesi() bisa pakai upsert dengan onConflict yang
-- valid (lihat lib/telephony/deps.ts, Prompt 3 di docs/TELEPHONY.md).
create unique index if not exists idx_cs_manual_dedup
  on public.call_sessions(agent_id, phone_e164, started_at);
