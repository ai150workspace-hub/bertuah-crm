"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateID } from "@/lib/wib-date";

export interface JadwalJauhRow {
  contactId: string;
  namaNasabah: string;
  agentName: string;
  /** Tanggal kalender WIB (YYYY-MM-DD) - dipakai juga untuk urut terjauh-ke-terdekat. */
  tanggalFollowupWib: string;
  alasan: string | null;
}

export interface JadwalJauhAgentCount {
  agentName: string;
  count: number;
}

/** Murni presentasi - filter, sortir, dan hitung per-agen sudah dilakukan di page.tsx. */
export function JadwalJauhCard({
  rows,
  agentCounts,
}: {
  rows: JadwalJauhRow[];
  agentCounts: JadwalJauhAgentCount[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jadwal Follow-up Lebih dari 7 Hari</CardTitle>
        <p className="text-sm text-muted-foreground">
          Lead dengan follow-up dijadwalkan lebih dari 7 hari ke depan, beserta alasannya.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada jadwal lebih dari 7 hari.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {agentCounts.map((a) => (
                <span key={a.agentName} className="text-xs text-muted-foreground">
                  {a.agentName} — {a.count} jadwal jauh
                </span>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Nama nasabah</th>
                    <th className="py-2 pr-3 font-medium">Agen pemegang</th>
                    <th className="py-2 pr-3 font-medium">Tanggal follow-up</th>
                    <th className="py-2 pr-3 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contactId} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.namaNasabah}</td>
                      <td className="py-2 pr-3">{r.agentName}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatDateID(r.tanggalFollowupWib)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.alasan ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
