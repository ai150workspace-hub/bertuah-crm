// Tanggal kalender WIB (UTC+7) tanpa DST, dihitung manual supaya konsisten
// baik dijalankan di server (biasanya UTC) maupun browser pengguna.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m0: number, d: number): string {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

export function todayWib(): string {
  const shifted = new Date(Date.now() + WIB_OFFSET_MS);
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

export function addDaysWib(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  return ymd(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
}

export function startOfWeekWib(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  const day = base.getUTCDay(); // 0 = Minggu
  const diff = (day + 6) % 7; // mulai dari Senin
  base.setUTCDate(base.getUTCDate() - diff);
  return ymd(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
}

export function startOfMonthWib(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return ymd(y!, m! - 1, 1);
}

/** Instant absolut awal/akhir hari WIB, untuk dibandingkan ke kolom timestamptz. */
export function wibDayStartIso(dateStr: string): string {
  return `${dateStr}T00:00:00+07:00`;
}

export function wibDayEndIso(dateStr: string): string {
  return `${dateStr}T23:59:59.999+07:00`;
}

const BULAN_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** Tanggal kalender WIB (YYYY-MM-DD) dari sebuah instant timestamptz. */
export function wibDateFromIso(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + WIB_OFFSET_MS);
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

export function formatDateID(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${BULAN_ID[m! - 1]} ${y}`;
}
