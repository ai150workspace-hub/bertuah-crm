import { normalizePhoneLocal } from "../lib/import/phone-local";
import { distributeAutoRoundRobin } from "../lib/import/distribute";

let ok = 0, fail = 0;
function cek(n: string, a: unknown, b: unknown) {
  const p = JSON.stringify(a) === JSON.stringify(b);
  if (p) ok++;
  else { fail++; console.log("FAIL", n, "got", JSON.stringify(a), "want", JSON.stringify(b)); }
}

console.log("== normalizePhoneLocal ==");
cek("local plain", normalizePhoneLocal("081234567891"), "081234567891");
cek("with dashes", normalizePhoneLocal("0812-3456-7891"), "081234567891");
cek("62 prefix", normalizePhoneLocal("6281234567891"), "081234567891");
cek("+62 prefix", normalizePhoneLocal("+62 812-3456-7891"), "081234567891");
cek("8-only prefix", normalizePhoneLocal("81234567891"), "081234567891");
cek("invalid text", normalizePhoneLocal("abc123"), null);
cek("too short", normalizePhoneLocal("0812345"), null);

console.log("== distributeAutoRoundRobin ==");
const agents = [
  { agentId: "a1", agentName: "Agent A", used: 45, capacity: 50 }, // sisa 5
  { agentId: "a2", agentName: "Agent B", used: 10, capacity: 50 }, // sisa 40
  { agentId: "a3", agentName: "Agent C", used: 50, capacity: 50 }, // sisa 0 (full)
];
const plan = distributeAutoRoundRobin([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], agents);
console.log("perAgentAssigned", plan.perAgentAssigned);
console.log("unassignedCount", plan.unassignedCount);
cek("a3 gets nothing (full)", plan.perAgentAssigned["a3"], undefined);
cek(
  "a2 gets more than a1 (bigger remaining)",
  (plan.perAgentAssigned["a2"] ?? 0) > (plan.perAgentAssigned["a1"] ?? 0),
  true
);
cek(
  "total assigned + unassigned = 10",
  Object.values(plan.perAgentAssigned).reduce((s, v) => s + v, 0) + plan.unassignedCount,
  10
);

// Kapasitas pas habis - kelebihan harus masuk unassigned
const tight = distributeAutoRoundRobin([0, 1, 2], [{ agentId: "x", agentName: "X", used: 0, capacity: 2 }]);
cek("kelebihan kapasitas -> unassigned", tight.unassignedCount, 1);
cek("agent x dapat tepat 2", tight.perAgentAssigned["x"], 2);

console.log();
console.log(fail === 0 ? `PASS ${ok}` : `FAIL ${fail}/${ok + fail}`);
