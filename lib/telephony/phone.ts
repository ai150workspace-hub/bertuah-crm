// lib/telephony/phone.ts
//
// Normalisasi nomor Indonesia. Seluruh sistem menyimpan format E.164
// TANPA tanda '+', digit saja: '628123456789'.
//
// Kenapa penting: pencocokan rekaman -> sesi dan rekonsiliasi call log
// perangkat -> call log CRM sama-sama bergantung pada perbandingan nomor
// yang persis sama. Satu format saja yang tidak konsisten dan seluruh
// deteksi fraud menghasilkan angka palsu.

/** Prefiks operator seluler Indonesia yang sah (setelah 62). */
const PREFIKS_SELULER = [
  '811','812','813','814','815','816','817','818','819',
  '821','822','823','828',
  '831','832','833','838',
  '851','852','853','855','856','857','858',
  '859','877','878','879',
  '881','882','883','884','885','886','887','888','889',
  '895','896','897','898','899',
];

/**
 * Ubah berbagai penulisan nomor jadi satu bentuk kanonik.
 * Mengembalikan null kalau nomornya tidak masuk akal — panggil ini
 * saat impor supaya sampah tidak masuk basis data.
 *
 *   '0812-3456-789'    -> '628123456789'
 *   '+62 812 3456 789' -> '628123456789'
 *   '62 812 3456 789'  -> '628123456789'
 *   '8123456789'       -> '628123456789'
 */
export function normalisasiNomor(input: string | null | undefined): string | null {
  if (!input) return null;

  let d = String(input).replace(/\D/g, '');
  if (!d) return null;

  // Buang awalan panggilan internasional
  if (d.startsWith('0062')) d = d.slice(4);
  else if (d.startsWith('062')) d = d.slice(3);

  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('62')) { /* sudah benar */ }
  else if (d.startsWith('8')) d = '62' + d;
  else return null;                      // nomor tetap / luar negeri — bukan target

  // 62 + 9..12 digit
  if (d.length < 11 || d.length > 14) return null;

  const prefiks = d.slice(2, 5);
  if (!PREFIKS_SELULER.includes(prefiks)) return null;

  return d;
}

/** Untuk ditampilkan ke manusia: '0812-3456-789'. */
export function formatTampil(e164: string): string {
  if (!e164.startsWith('62')) return e164;
  const lokal = '0' + e164.slice(2);
  return lokal.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

/** URI dial untuk adapter non-PBX. */
export function telUri(e164: string): string {
  return `tel:+${e164}`;
}

/** URL WhatsApp — sejalan dengan buildWAUrl yang sudah ada di PRD. */
export function waUrl(e164: string, pesan: string): string {
  return `https://wa.me/${e164}?text=${encodeURIComponent(pesan)}`;
}
