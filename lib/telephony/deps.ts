// Perakitan dependensi — di sinilah Supabase disambungkan.
// Isi fungsi ini mengikuti struktur proyekmu; kontraknya sudah pasti.
import type { ManualDeps } from './adapters/manual';
import type { PbxDeps } from './adapters/pbx';

export async function buatManualDeps(): Promise<ManualDeps> {
  throw new Error('TODO: rakit ManualDeps dari klien Supabase');
}
export async function buatPbxDeps(): Promise<PbxDeps> {
  throw new Error('TODO: rakit PbxDeps saat pindah ke PBX');
}
