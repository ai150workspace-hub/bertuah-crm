// lib/script-placeholder.ts
//
// Satu-satunya tempat yang tahu cara mengisi placeholder {{...}} di
// script_content dan wa_templates dengan data kontak/simulasi yang
// sedang aktif. Dipakai ScriptSidebar (5 section) dan lib/wa-templates.ts
// (4 jenis WA) - keduanya berbagi kunci placeholder yang sama, WA
// template cuma menambah beberapa kunci lagi (hari_tanggal, jam, dst).

export interface ScriptPlaceholderData {
  nama: string;
  /** Gabungan jenis_kendaraan + merk_tipe, mis. "Motor Honda Vario". */
  kendaraan: string;
  tahun: number;
  merk: string;
  /** Dari kalkulator simulasi - format Rupiah tanpa "Rp" (mis. "50.000.000"). */
  jumlah?: string;
  /** Dari kalkulator simulasi - format Rupiah tanpa "Rp". */
  cicilan?: string;
  tenor?: number;
}

export interface WaPlaceholderData extends ScriptPlaceholderData {
  hariTanggal?: string;
  jam?: string;
  alamat?: string;
  bulan?: string;
  promo?: string;
}

const SIMULATOR_FALLBACK = "(isi kalkulator dulu)";

/** {{key}} -> [nilai, apakah ini fallback karena data belum ada]. */
function resolveToken(
  key: string,
  data: WaPlaceholderData
): { text: string; isFallback: boolean } {
  switch (key) {
    case "nama":
      return { text: data.nama || "Bapak/Ibu", isFallback: !data.nama };
    case "kendaraan":
      return {
        text: data.kendaraan || "kendaraan Bapak/Ibu",
        isFallback: !data.kendaraan,
      };
    case "tahun":
      return { text: data.tahun ? String(data.tahun) : "", isFallback: !data.tahun };
    case "merk":
      return { text: data.merk || "kendaraannya", isFallback: !data.merk };
    case "jumlah":
      return { text: data.jumlah || SIMULATOR_FALLBACK, isFallback: !data.jumlah };
    case "cicilan":
      return { text: data.cicilan || SIMULATOR_FALLBACK, isFallback: !data.cicilan };
    case "tenor":
      return {
        text: data.tenor ? String(data.tenor) : SIMULATOR_FALLBACK,
        isFallback: !data.tenor,
      };
    case "hari_tanggal":
      return { text: data.hariTanggal || SIMULATOR_FALLBACK, isFallback: !data.hariTanggal };
    case "jam":
      return { text: data.jam || SIMULATOR_FALLBACK, isFallback: !data.jam };
    case "alamat":
      return { text: data.alamat || SIMULATOR_FALLBACK, isFallback: !data.alamat };
    case "bulan":
      return { text: data.bulan || SIMULATOR_FALLBACK, isFallback: !data.bulan };
    case "promo":
      return { text: data.promo || SIMULATOR_FALLBACK, isFallback: !data.promo };
    default:
      // Placeholder tidak dikenal - jangan tampilkan {{mentah}} ke agent,
      // lebih baik kosong daripada bocor ke naskah yang dibaca ke customer.
      return { text: "", isFallback: true };
  }
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/** Versi plain-text - dipakai untuk copy-to-clipboard dan pesan WA. */
export function fillPlaceholders(
  template: string,
  data: ScriptPlaceholderData
): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => resolveToken(key, data).text);
}

/** Sama seperti fillPlaceholders, tapi terima field WA tambahan. */
export function fillWaPlaceholders(template: string, data: WaPlaceholderData): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => resolveToken(key, data).text);
}

export interface PlaceholderSegment {
  text: string;
  /** true kalau ini nilai asli terisi dari data yang tidak lengkap - dipakai untuk styling abu-abu di UI. */
  isFallback: boolean;
}

/**
 * Pecah template jadi segmen teks + tanda fallback, supaya UI (ScriptSidebar)
 * bisa render bagian yang belum terisi (mis. "(isi kalkulator dulu)") dengan
 * warna abu-abu, tanpa menampilkan {{jumlah}} mentah ke agent.
 */
export function splitPlaceholders(
  template: string,
  data: WaPlaceholderData
): PlaceholderSegment[] {
  const segments: PlaceholderSegment[] = [];
  let lastIndex = 0;
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const [full, key] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: template.slice(lastIndex, index), isFallback: false });
    }
    const resolved = resolveToken(key!, data);
    segments.push({ text: resolved.text, isFallback: resolved.isFallback });
    lastIndex = index + full.length;
  }
  if (lastIndex < template.length) {
    segments.push({ text: template.slice(lastIndex), isFallback: false });
  }
  return segments;
}
