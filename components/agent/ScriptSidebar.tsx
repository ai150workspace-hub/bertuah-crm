"use client";

import { useEffect, useState } from "react";
import { PanelRightOpen, PanelRightClose, Copy, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ScriptContentRow, ScriptSection } from "@/lib/scripts";
import { fillPlaceholders, splitPlaceholders, type ScriptPlaceholderData } from "@/lib/script-placeholder";

const SECTION_LABEL: Record<ScriptSection, string> = {
  opening: "Opening",
  probing: "Probing",
  presentasi: "Presentasi",
  closing: "Closing",
  objection_handling: "Handling Penolakan",
};

const SECTION_ORDER: ScriptSection[] = [
  "opening",
  "probing",
  "presentasi",
  "closing",
  "objection_handling",
];

const NEW_AGENT_DAYS = 30;

function storageKey(agentId: string): string {
  return `script_sidebar_state_${agentId}`;
}

function defaultOpenState(agentId: string, agentCreatedAt: string): boolean {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(storageKey(agentId));
    if (saved === "open") return true;
    if (saved === "closed") return false;
  }
  const daysSinceJoin = (Date.now() - new Date(agentCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceJoin < NEW_AGENT_DAYS;
}

function ScriptText({ template, data }: { template: string; data: ScriptPlaceholderData }) {
  const segments = splitPlaceholders(template, data);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed">
      {segments.map((seg, i) =>
        seg.isFallback ? (
          <span key={i} className="text-muted-foreground italic">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Script disalin.");
    } catch {
      toast.error("Gagal menyalin — coba salin manual.");
    }
  }
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCopy}>
      <Copy className="h-3 w-3" /> Copy
    </Button>
  );
}

function ScriptItem({ row, data }: { row: ScriptContentRow; data: ScriptPlaceholderData }) {
  const [escalationOpen, setEscalationOpen] = useState(false);
  const filledText = fillPlaceholders(row.scriptText, data);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-semibold">{row.scenarioName}</div>
          {(row.category || row.isBuyingSignal) && (
            <div className="flex flex-wrap gap-1.5">
              {row.category && (
                <Badge variant="outline" className="text-[10px]">
                  {row.category}
                </Badge>
              )}
              {row.isBuyingSignal && (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] dark:text-amber-400">
                  <Zap className="h-2.5 w-2.5" /> Buying Signal
                </Badge>
              )}
            </div>
          )}
        </div>
        <CopyButton text={filledText} />
      </div>

      <ScriptText template={row.scriptText} data={data} />

      {row.tipsText && (
        <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
          💡 {row.tipsText}
        </p>
      )}

      {row.escalationRule && (
        <div>
          <button
            type="button"
            onClick={() => setEscalationOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", escalationOpen && "rotate-180")} />
            Aturan Selanjutnya
          </button>
          {escalationOpen && (
            <p className="mt-1 text-xs text-muted-foreground">{row.escalationRule}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ScriptSidebar({
  scripts,
  agentId,
  agentCreatedAt,
  placeholderData,
}: {
  scripts: ScriptContentRow[];
  agentId: string;
  agentCreatedAt: string;
  placeholderData: ScriptPlaceholderData;
}) {
  // Mulai collapsed di server (SSR) supaya tidak ada hydration mismatch -
  // begitu mount di client, langsung disesuaikan ke localStorage/aturan
  // 30 hari yang sesungguhnya.
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // localStorage/aturan 30-hari cuma bisa dibaca di client - satu kali
    // koreksi setelah mount ini disengaja (bukan sinkronisasi berulang),
    // supaya render pertama (server) tetap konsisten dengan client sebelum
    // localStorage terbaca.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(defaultOpenState(agentId, agentCreatedAt));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey(agentId), open ? "open" : "closed");
  }, [open, agentId, hydrated]);

  const bySection = new Map<ScriptSection, ScriptContentRow[]>();
  for (const row of scripts) {
    const arr = bySection.get(row.section) ?? [];
    arr.push(row);
    bySection.set(row.section, arr);
  }

  if (!open) {
    return (
      <div className="flex shrink-0 flex-col items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          title="Buka panduan script"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col sm:w-80">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Panduan Script
        </h4>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title="Tutup panduan script">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="opening" className="min-h-0 flex-1">
        <TabsList variant="line" className="w-full flex-wrap">
          {SECTION_ORDER.map((section) => (
            <TabsTrigger key={section} value={section} className="text-[11px]">
              {SECTION_LABEL[section]}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTION_ORDER.map((section) => (
          <TabsContent key={section} value={section} className="mt-2 space-y-2 overflow-y-auto">
            {(bySection.get(section) ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada script untuk section ini.</p>
            )}
            {(bySection.get(section) ?? []).map((row) => (
              <ScriptItem key={row.id} row={row} data={placeholderData} />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
