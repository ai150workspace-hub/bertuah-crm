"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface JamEfektifHourRow {
  hour: number;
  total: number;
  bicara: number;
  bicaraPercent: number;
}

export interface JamEfektifAgentData {
  agentId: string;
  agentName: string;
  totalCall: number;
  /** Cuma jam yang ada panggilannya, terurut naik. */
  hourly: JamEfektifHourRow[];
  /** Persen bicara rata-rata agen ini sendiri di periode ini - patokan untuk warna aksen tiap batang jam. */
  avgBicaraPercent: number;
  /** Kartu "Mulai Tepat Waktu" - cuma hari sejak aturan jam berlaku (lihat ATURAN_JAM_BERLAKU_SEJAK di page.tsx). */
  hariDinilai: number;
  hariTepatWaktu: number;
  hariTerlaluPagi: number;
  hariTerlambat: number;
  jamEmasPercent: number;
  rataRataPercobaan: number;
  panggilanSore: number;
}

// Jam emas (11:00-13:59 WIB) - aturan #2: diisi nomor terbaik & follow-up penting.
const JAM_EMAS = new Set([11, 12, 13]);

function formatJam(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Murni presentasi - semua perhitungan (per jam, jam mulai, dst.) sudah dilakukan di page.tsx. */
export function JamEfektifCard({ agents }: { agents: JamEfektifAgentData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jam Efektif Menelepon</CardTitle>
        <p className="text-sm text-muted-foreground">
          Jam mana yang paling banyak menghasilkan percakapan — dan apakah aturan jam sudah
          dijalankan.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada agen.</p>
        )}
        {agents.map((agent, i) => {
          const maxTotal = agent.hourly.reduce((m, h) => Math.max(m, h.total), 0);

          return (
            <div key={agent.agentId} className={cn("space-y-3", i > 0 && "border-t pt-5")}>
              <h4 className="text-sm font-semibold">{agent.agentName}</h4>

              {agent.totalCall === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada panggilan di periode ini.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Mulai Tepat Waktu</div>
                      {agent.hariDinilai === 0 ? (
                        <div className="text-sm text-muted-foreground">belum ada hari yang dinilai</div>
                      ) : (
                        <>
                          <div
                            className={cn(
                              "text-lg font-semibold tabular-nums",
                              agent.hariTepatWaktu < agent.hariDinilai / 2 && "text-destructive"
                            )}
                          >
                            {agent.hariTepatWaktu} dari {agent.hariDinilai} hari
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            mulai 09:00-09:30 · dihitung sejak 16 Sep 2026
                          </div>
                          {(agent.hariTerlaluPagi > 0 || agent.hariTerlambat > 0) && (
                            <div className="text-[11px] text-muted-foreground">
                              {[
                                agent.hariTerlaluPagi > 0 ? `${agent.hariTerlaluPagi} terlalu pagi` : null,
                                agent.hariTerlambat > 0 ? `${agent.hariTerlambat} terlambat` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Porsi Jam Emas</div>
                      <div
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          agent.jamEmasPercent < 30 && "text-destructive"
                        )}
                      >
                        {Math.round(agent.jamEmasPercent)}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">panggilan jam 11-13</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Rata-rata Percobaan</div>
                      <div
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          agent.rataRataPercobaan < 1.2 && "text-destructive"
                        )}
                      >
                        {agent.rataRataPercobaan.toFixed(1).replace(".", ",")}x
                      </div>
                      <div className="text-[11px] text-muted-foreground">panggilan per kontak</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs text-muted-foreground">Panggilan Sore</div>
                      <div className="text-lg font-semibold tabular-nums">{agent.panggilanSore}</div>
                      <div className="text-[11px] text-muted-foreground">jam 16-17</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {agent.hourly.map((h) => {
                      const widthPercent = maxTotal > 0 ? (h.total / maxTotal) * 100 : 0;
                      const aboveAvg = h.bicaraPercent > agent.avgBicaraPercent;
                      const isGolden = JAM_EMAS.has(h.hour);
                      return (
                        <div
                          key={h.hour}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-1.5 py-0.5",
                            isGolden && "bg-hot/5"
                          )}
                        >
                          <span className="flex w-14 shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                            {formatJam(h.hour)}
                            {isGolden && <span className="text-hot" title="Jam emas">●</span>}
                          </span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                aboveAvg ? "bg-success" : "bg-muted-foreground/40"
                              )}
                              style={{ width: `${widthPercent}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {h.total} · {Math.round(h.bicaraPercent)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
