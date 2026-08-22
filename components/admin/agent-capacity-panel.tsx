"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Pencil, Check, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { updateAgentCapacity, type AgentCapacityInfo } from "@/app/actions/import";

export function AgentCapacityPanel({ agents }: { agents: AgentCapacityInfo[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(agentId: string) {
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Kapasitas harus angka >= 0.");
      return;
    }
    setSaving(true);
    const result = await updateAgentCapacity(agentId, value);
    setSaving(false);
    if (!result.success) {
      toast.error("Gagal ubah kapasitas.", { description: result.error });
      return;
    }
    toast.success("Kapasitas diperbarui.");
    setEditingId(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Kapasitas Agent
        </CardTitle>
        <CardDescription>
          Slot data Uncalled maksimum per agent — dipakai mode Auto Round Robin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {agents.map((a) => {
          const pct = a.capacity > 0 ? Math.min(100, Math.round((a.used / a.capacity) * 100)) : 0;
          const sisa = Math.max(0, a.capacity - a.used);
          const isEditing = editingId === a.agentId;

          return (
            <div key={a.agentId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{a.agentName}</span>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-7 w-20 text-right"
                      autoFocus
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => save(a.agentId)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {a.used}/{a.capacity} slot terisi, sisa {sisa}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(a.agentId);
                        setDraft(String(a.capacity));
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </span>
                )}
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada agent aktif.</p>
        )}
      </CardContent>
    </Card>
  );
}
