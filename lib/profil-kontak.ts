// Profil nasabah dari file upload: pekerjaan, rating, dan status kontrak.
// Satu-satunya definisi daftar nilai & aturan normalisasinya - dipakai impor
// CSV (server), tampilan agen, dan filter admin (klien). Tanpa import server,
// supaya aman dipakai komponen klien.

/** Rating dari template upload baru, urutan seperti di template. Bentuk kanonik. */
export const RATING_KANONIK = [
  "Excellent",
  "Good",
  "CR-1",
  "CR-2",
  "CR-3",
  "Normal",
  "Inactive",
] as const;
export type RatingKanonik = (typeof RATING_KANONIK)[number];

/**
 * Rating LAMA (batch upload 13 September, kolom "catatan" waktu itu) -
 * disimpan huruf kecil apa adanya di kolom yang sama. Bukan bagian daftar
 * kanonik; hanya ada dari backfill migrasi 0030 dan header "catatan" lama.
 */
export const RATING_LAMA = ["tinggi", "sedang", "rendah"] as const;

/** Status kontrak = contacts.status_kredit_kendaraan (kolom lama, dipakai ulang). */
export const STATUS_KONTRAK = ["RRD", "ICP", "EXP", "LIV"] as const;
export type StatusKontrak = (typeof STATUS_KONTRAK)[number];

export interface InfoStatusKontrak {
  kepanjangan: string;
  /** Satu kalimat untuk agen. */
  keterangan: string;
  /** Hanya LIV: hal yang perlu ditanyakan agen. */
  tanyakan?: string;
}

export const INFO_STATUS_KONTRAK: Record<StatusKontrak, InfoStatusKontrak> = {
  RRD: {
    kepanjangan: "Ready to Release Document",
    keterangan: "BPKB siap dilepas",
  },
  ICP: {
    kepanjangan: "In Complete Payment",
    keterangan: "Tinggal sisa denda",
  },
  EXP: {
    kepanjangan: "Expired",
    keterangan: "Kontrak sudah selesai",
  },
  LIV: {
    kepanjangan: "Live",
    keterangan: "Masih kredit berjalan - peluang TAKE OVER",
    tanyakan: "Tanyakan: leasing mana, sisa tenor, dan tahun kendaraan.",
  },
};

const rapikan = (v: unknown): string =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Rating dari kolom `rating` file upload: bebas huruf besar-kecil -> bentuk kanonik; di luar daftar -> null. */
export function normalisasiRating(v: unknown): RatingKanonik | null {
  const kunci = rapikan(v).toLowerCase();
  if (!kunci) return null;
  return RATING_KANONIK.find((r) => r.toLowerCase() === kunci) ?? null;
}

/** Status kontrak dari kolom `status_kontrak`: bebas huruf besar-kecil -> UPPERCASE; di luar daftar -> null. */
export function normalisasiStatusKontrak(v: unknown): StatusKontrak | null {
  const kunci = rapikan(v).toUpperCase();
  if (!kunci) return null;
  return STATUS_KONTRAK.find((s) => s === kunci) ?? null;
}

/** Pekerjaan: spasi dirapatkan, huruf kecil - sama dengan backfill migrasi 0030. "" kalau kosong. */
export function normalisasiPekerjaan(v: unknown): string {
  return rapikan(v).toLowerCase();
}

/** Nilai rating yang boleh disimpan: kanonik, atau salah satu rating lama (huruf kecil). Lainnya null. */
export function ratingUntukSimpan(v: unknown): string | null {
  const kanonik = normalisasiRating(v);
  if (kanonik) return kanonik;
  const lama = rapikan(v).toLowerCase();
  return (RATING_LAMA as readonly string[]).includes(lama) ? lama : null;
}

/**
 * Header lama "catatan": isinya dulu campuran - rating lama ("tinggi"/
 * "sedang"/"rendah") atau pekerjaan. Dipisah dengan aturan yang SAMA dengan
 * backfill 0030, supaya file lama tidak mencemari kolom pekerjaan lagi.
 */
export function pisahCatatanLama(v: unknown): { pekerjaan: string; ratingLama: string | null } {
  const nilai = rapikan(v).toLowerCase();
  if (!nilai || nilai.startsWith("[")) return { pekerjaan: "", ratingLama: null };
  if ((RATING_LAMA as readonly string[]).includes(nilai)) return { pekerjaan: "", ratingLama: nilai };
  return { pekerjaan: nilai, ratingLama: null };
}

/** Untuk tampilan: kanonik apa adanya, rating lama dengan huruf awal besar ("tinggi" -> "Tinggi"). */
export function labelRating(v: string | null | undefined): string {
  if (!v) return "";
  const kanonik = normalisasiRating(v);
  if (kanonik) return kanonik;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** Untuk tampilan: huruf awal besar. */
export function labelPekerjaan(v: string | null | undefined): string {
  if (!v) return "";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** "RRD · Good" - kolom gabungan di antrean agen. Kosong -> null. */
export function labelKontrakRating(
  statusKontrak: string | null | undefined,
  rating: string | null | undefined
): string | null {
  const bagian = [statusKontrak || null, rating ? labelRating(rating) : null].filter(
    (x): x is string => Boolean(x)
  );
  return bagian.length > 0 ? bagian.join(" · ") : null;
}

export interface RingkasanKolomBaru {
  /** Jumlah baris yang dihitung (valid + duplikat yang ikut diimpor). */
  totalBaris: number;
  punyaPekerjaan: number;
  punyaRating: number;
  punyaStatusKontrak: number;
  /** Sel terisi tapi bukan salah satu nilai daftar (disimpan sebagai kosong). */
  ratingTidakDikenali: number;
  statusKontrakTidakDikenali: number;
}

interface BarisProfil {
  pekerjaan: string;
  rating: string | null;
  statusKontrak: string | null;
  ratingTidakDikenali: boolean;
  statusKontrakTidakDikenali: boolean;
}

export function ringkasKolomBaru(rows: BarisProfil[]): RingkasanKolomBaru {
  const hasil: RingkasanKolomBaru = {
    totalBaris: rows.length,
    punyaPekerjaan: 0,
    punyaRating: 0,
    punyaStatusKontrak: 0,
    ratingTidakDikenali: 0,
    statusKontrakTidakDikenali: 0,
  };
  for (const r of rows) {
    if (r.pekerjaan) hasil.punyaPekerjaan += 1;
    if (r.rating) hasil.punyaRating += 1;
    if (r.statusKontrak) hasil.punyaStatusKontrak += 1;
    if (r.ratingTidakDikenali) hasil.ratingTidakDikenali += 1;
    if (r.statusKontrakTidakDikenali) hasil.statusKontrakTidakDikenali += 1;
  }
  return hasil;
}
