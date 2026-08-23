import {
  getDailyRate,
  getMonthlyBonusTier,
  calculateAgentIncentive,
  AGENT_BASE_SALARY,
  OPEX_NON_SALARY,
} from "../lib/incentive-calculator";

let ok = 0, fail = 0;
function cek(n: string, a: unknown, b: unknown) {
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) ok++;
  else { fail++; console.log("FAIL", n, "got", JSON.stringify(a), "want", JSON.stringify(b)); }
}

console.log("== getDailyRate: tenor di luar kunci pakai rate terdekat DI BAWAHNYA ==");
cek("tenor 12", getDailyRate(12), 0.0025);
cek("tenor 18 -> pakai 12", getDailyRate(18), 0.0025);
cek("tenor 24", getDailyRate(24), 0.005);
cek("tenor 30 -> pakai 24", getDailyRate(30), 0.005);
cek("tenor 36", getDailyRate(36), 0.01);
cek("tenor 42 -> pakai 36", getDailyRate(42), 0.01);
cek("tenor 48", getDailyRate(48), 0.0125);
cek("tenor 60 -> pakai 48 (tertinggi)", getDailyRate(60), 0.0125);
cek("tenor 6 (di bawah 12) -> fallback 12", getDailyRate(6), 0.0025);

console.log("\n== getMonthlyBonusTier ==");
cek("0 -> bonus 0", getMonthlyBonusTier(0).bonus, 0);
cek("99.999.999 -> masih tier 0", getMonthlyBonusTier(99_999_999).bonus, 0);
cek("tepat 100jt -> tier 500rb", getMonthlyBonusTier(100_000_000).bonus, 500_000);
cek("149.999.999 -> masih tier 500rb", getMonthlyBonusTier(149_999_999).bonus, 500_000);
cek("tepat 150jt -> tier 950rb", getMonthlyBonusTier(150_000_000).bonus, 950_000);
cek("tepat 550jt -> tier tertinggi 7.8jt", getMonthlyBonusTier(550_000_000).bonus, 7_800_000);
cek("1 miliar -> tetap tier tertinggi (max Infinity)", getMonthlyBonusTier(1_000_000_000).bonus, 7_800_000);

console.log("\n== calculateAgentIncentive ==");
const r1 = calculateAgentIncentive(
  { agentId: "a1", agentName: "Agent A", deals: [{ nominalPencairan: 100_000_000, tenorBulan: 24 }] },
  2
);
cek("totalPencairan", r1.totalPencairan, 100_000_000);
cek("dailyKomisi = 100jt x 0.5%", r1.totalDailyKomisi, 500_000);
cek("monthlyBonus (tier 100jt)", r1.monthlyBonus, 500_000);
cek("takeHome = 1.5jt + 500rb + 500rb", r1.takeHome, AGENT_BASE_SALARY + 500_000 + 500_000);
cek("revenuePku = 100jt x 5%", r1.revenuePku, 5_000_000);
// opexPerAgent = takeHome(2.5jt) + OPEX_NON_SALARY/2(980rb) = 3.48jt
// netPku = 5jt - 3.48jt = 1.52jt ; margin = 1.52/5 = 30.4%
cek("netPku", r1.netPku, 5_000_000 - (r1.takeHome + OPEX_NON_SALARY / 2));
cek("marginPkuPct = 30.4%", Number(r1.marginPkuPct?.toFixed(1)), 30.4);

console.log("\n== tanpa deal sama sekali ==");
const r2 = calculateAgentIncentive({ agentId: "a2", agentName: "Agent B", deals: [] }, 2);
cek("totalPencairan 0", r2.totalPencairan, 0);
cek("takeHome = base salary saja", r2.takeHome, AGENT_BASE_SALARY);
cek("revenuePku 0", r2.revenuePku, 0);
cek("marginPkuPct null (revenue 0) -> tampil '—'", r2.marginPkuPct, null);
cek("netPku negatif (opex > 0, revenue 0)", r2.netPku < 0, true);

console.log("\n== beberapa deal beda tenor dalam 1 bulan ==");
const r3 = calculateAgentIncentive(
  {
    agentId: "a3",
    agentName: "Agent C",
    deals: [
      { nominalPencairan: 200_000_000, tenorBulan: 12 }, // 200jt x 0.25% = 500rb
      { nominalPencairan: 150_000_000, tenorBulan: 36 }, // 150jt x 1% = 1.5jt
    ],
  },
  2
);
cek("totalPencairan = 350jt", r3.totalPencairan, 350_000_000);
cek("dailyKomisi gabungan", r3.totalDailyKomisi, 500_000 + 1_500_000);
cek("tier 350jt -> bonus 3.6jt", r3.monthlyBonus, 3_600_000);

console.log();
console.log(fail === 0 ? `PASS ${ok}` : `FAIL ${fail}/${ok + fail}`);
