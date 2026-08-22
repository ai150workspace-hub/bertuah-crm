// Distribusi drip-feed saat import: "fill yang paling kosong dulu" —
// tiap baris diberikan ke agent dengan SISA kapasitas terbesar saat itu
// (bukan round robin murni berurutan). Agent dengan sisa 0 dilewati.
// Sisa baris yang tidak tertampung -> Unassigned Pool (agentId null).

export interface AgentCapacity {
  agentId: string;
  agentName: string;
  used: number;
  capacity: number;
}

export interface DistributionAssignment {
  rowIndex: number;
  agentId: string | null;
}

export interface DistributionPlan {
  assignments: DistributionAssignment[];
  perAgentAssigned: Record<string, number>;
  unassignedCount: number;
}

export function remainingCapacity(agent: AgentCapacity): number {
  return Math.max(0, agent.capacity - agent.used);
}

export function distributeAutoRoundRobin(
  rowIndexes: number[],
  agents: AgentCapacity[]
): DistributionPlan {
  const remaining = new Map(agents.map((a) => [a.agentId, remainingCapacity(a)]));
  const perAgentAssigned: Record<string, number> = {};
  const assignments: DistributionAssignment[] = [];
  let unassignedCount = 0;

  for (const rowIndex of rowIndexes) {
    let bestAgent: string | null = null;
    let bestRemaining = 0;
    for (const [agentId, rem] of remaining) {
      if (rem > bestRemaining) {
        bestRemaining = rem;
        bestAgent = agentId;
      }
    }

    if (bestAgent) {
      assignments.push({ rowIndex, agentId: bestAgent });
      perAgentAssigned[bestAgent] = (perAgentAssigned[bestAgent] ?? 0) + 1;
      remaining.set(bestAgent, remaining.get(bestAgent)! - 1);
    } else {
      assignments.push({ rowIndex, agentId: null });
      unassignedCount++;
    }
  }

  return { assignments, perAgentAssigned, unassignedCount };
}
