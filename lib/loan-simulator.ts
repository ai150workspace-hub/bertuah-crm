// BPKB loan simulation — ported from FinMatch_PKU_PRD.md section 16.
// Indicative only — not an official leasing quotation.

export interface LoanSimulationInput {
  nilaiKendaraan: number;
  persenPinjaman?: number; // default 75%
  tenorBulan: number;
  bungaFlatPerBulan?: number; // default 1.75% flat/month
}

export interface LoanSimulationResult {
  nilaiKendaraan: number;
  maksimalPinjaman: number;
  nominalPinjaman: number;
  bungaFlatPerBulan: number;
  totalBunga: number;
  totalPembayaran: number;
  angsuranPerBulan: number;
  komisiAggregator: number;
  tenorBulan: number;
}

export function simulateLoan(
  input: LoanSimulationInput,
  komisiPercent = 5
): LoanSimulationResult {
  const {
    nilaiKendaraan,
    persenPinjaman = 75,
    tenorBulan,
    bungaFlatPerBulan = 1.75,
  } = input;

  const maksimalPinjaman = Math.round((nilaiKendaraan * persenPinjaman) / 100);
  const nominalPinjaman = maksimalPinjaman;

  const totalBunga = nominalPinjaman * (bungaFlatPerBulan / 100) * tenorBulan;
  const totalPembayaran = nominalPinjaman + totalBunga;
  const angsuranPerBulan = Math.round(totalPembayaran / tenorBulan);
  const komisiAggregator = Math.round(nominalPinjaman * (komisiPercent / 100));

  return {
    nilaiKendaraan,
    maksimalPinjaman,
    nominalPinjaman,
    bungaFlatPerBulan,
    totalBunga: Math.round(totalBunga),
    totalPembayaran: Math.round(totalPembayaran),
    angsuranPerBulan,
    komisiAggregator,
    tenorBulan,
  };
}

export const TENOR_OPTIONS = [12, 18, 24, 36] as const;
