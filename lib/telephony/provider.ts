// lib/telephony/provider.ts
//
// Satu-satunya tempat yang tahu adapter mana sedang dipakai.
// Kode lain — halaman, server action, cron — HANYA berbicara ke
// TelephonyProvider. Itu yang membuat pindah ke PBX nanti tidak
// menyentuh apa pun selain berkas ini dan satu baris di system_config.

import type { TelephonyProvider, ProviderKind } from './types';
import { ManualProvider } from './adapters/manual';
import { PbxProvider } from './adapters/pbx';
import { buatManualDeps, buatPbxDeps } from './deps';

let cache: { kind: ProviderKind; provider: TelephonyProvider } | null = null;

async function bacaKindTerkonfigurasi(): Promise<ProviderKind> {
  // Env menang atas DB — memudahkan uji coba PBX di staging
  // tanpa mengubah konfigurasi produksi.
  const dariEnv = process.env.TELEPHONY_PROVIDER as ProviderKind | undefined;
  if (dariEnv === 'manual' || dariEnv === 'gsm_log' || dariEnv === 'pbx') return dariEnv;

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_config').select('value').eq('key', 'telephony_provider').single();

  const v = data?.value as ProviderKind | undefined;
  return v === 'pbx' || v === 'gsm_log' ? v : 'manual';
}

export async function getTelephonyProvider(): Promise<TelephonyProvider> {
  const kind = await bacaKindTerkonfigurasi();
  if (cache?.kind === kind) return cache.provider;

  const provider: TelephonyProvider =
    kind === 'pbx'
      ? new PbxProvider(await buatPbxDeps())
      // gsm_log memakai jalur yang sama dengan manual; bedanya CSV
      // disinkronkan aplikasi, bukan diunggah tangan. Bentuk datanya identik.
      : new ManualProvider(await buatManualDeps());

  cache = { kind, provider };
  return provider;
}

/** Panggil setelah mengubah system_config supaya tidak perlu deploy ulang. */
export function resetTelephonyCache(): void {
  cache = null;
}

/**
 * Dipakai UI untuk menyembunyikan fitur yang belum didukung.
 * Contoh: tombol "Panggil dari CRM" hanya muncul saat clickToCall true;
 * kolom durasi hanya bisa diketik saat authoritativeDuration false.
 */
export async function getCapabilities() {
  return (await getTelephonyProvider()).capabilities;
}
