"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateAgentIncentive } from "@/lib/incentive-calculator";

function monthRange(month: number, year: number) {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { monthStart, monthEndExclusive };
}

export interface LockIncentiveResult {
  success: boolean;
  error?: string;
  lockedCount?: number;
}

export async function lockIncentiveMonth(
  month: number,
  year: number
): Promise<LockIncentiveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  const { data: agentRows } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "agent")
    .eq("is_active", true);
  const agents = agentRows ?? [];
  if (agents.length === 0) {
    return { success: false, error: "Tidak ada agent aktif untuk dikunci." };
  }

  const { monthStart, monthEndExclusive } = monthRange(month, year);
  const { data: appRows, error: appErr } = await supabase
    .from("applications")
    .select("agent_id, nominal_pencairan, tenor_bulan")
    .eq("status_aplikasi", "Disbursed")
    .gte("date_disbursed", monthStart)
    .lt("date_disbursed", monthEndExclusive);
  if (appErr) return { success: false, error: appErr.message };

  const dealsByAgent = new Map<string, { nominalPencairan: number; tenorBulan: number }[]>();
  for (const d of appRows ?? []) {
    const list = dealsByAgent.get(d.agent_id) ?? [];
    list.push({ nominalPencairan: d.nominal_pencairan ?? 0, tenorBulan: d.tenor_bulan ?? 12 });
    dealsByAgent.set(d.agent_id, list);
  }

  const snapshots = agents.map((a) => {
    const r = calculateAgentIncentive(
      { agentId: a.id, agentName: a.name, deals: dealsByAgent.get(a.id) ?? [] },
      agents.length
    );
    return {
      agent_id: r.agentId,
      periode_bulan: month,
      periode_tahun: year,
      total_pencairan: r.totalPencairan,
      total_komisi_harian: r.totalDailyKomisi,
      bonus_bulanan: r.monthlyBonus,
      take_home: r.takeHome,
      revenue_pku: r.revenuePku,
      net_pku: r.netPku,
      margin_pku_pct: r.marginPkuPct,
      tier_label: r.tierLabel,
      locked_by: user.id,
      locked_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await supabase
    .from("incentive_snapshots")
    .upsert(snapshots, { onConflict: "agent_id,periode_bulan,periode_tahun" });
  if (upsertErr) return { success: false, error: upsertErr.message };

  revalidatePath("/admin/incentives");
  return { success: true, lockedCount: snapshots.length };
}

export interface UnlockIncentiveResult {
  success: boolean;
  error?: string;
}

export async function unlockIncentiveMonth(
  month: number,
  year: number
): Promise<UnlockIncentiveResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("incentive_snapshots")
    .delete()
    .eq("periode_bulan", month)
    .eq("periode_tahun", year);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/incentives");
  return { success: true };
}
