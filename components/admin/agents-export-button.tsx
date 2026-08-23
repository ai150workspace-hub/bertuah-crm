"use client";

import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentReportRow } from "@/components/admin/agents-report-table";
import type { DatabaseHealthData } from "@/components/admin/database-health-card";

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function periodeLabel(toDate: string): string {
  const [y, m] = toDate.split("-").map(Number);
  return `${BULAN_ID[m! - 1]}-${y}`;
}

export function AgentsExportButton({
  rows,
  health,
  periodeTo,
}: {
  rows: AgentReportRow[];
  health: DatabaseHealthData;
  periodeTo: string;
}) {
  function handleExport() {
    const ringkasan = rows.map((r) => ({
      Agen: r.agentName,
      "Data Di-assign": r.dataDiAssign,
      "Sudah Dikerjakan": r.sudahDikerjakan,
      "Uncalled Sisa": r.uncalledSisa,
      "Utilisasi %": r.utilisasiPercent === null ? "" : Number(r.utilisasiPercent.toFixed(1)),
      "Total Call": r.totalCall,
      Connected: r.connected,
      "Contact Rate %": r.contactRatePercent === null ? "" : Number(r.contactRatePercent.toFixed(1)),
      "Hot Lead": r.hotLead,
      Warm: r.warm,
      Closed: r.closed,
      "Conversion Rate %":
        r.conversionRatePercent === null ? "" : Number(r.conversionRatePercent.toFixed(1)),
      "Aplikasi Masuk": r.aplikasiMasuk,
      Disbursed: r.disbursedCount,
      "Total Pencairan": r.totalPencairan,
      "Terakhir Call": r.lastActivity ? new Date(r.lastActivity).toLocaleString("id-ID") : "Belum pernah",
    }));

    const databaseHealth = health.segments.map((s) => ({
      Status: s.label,
      Jumlah: s.count,
      Persentase: health.total > 0 ? Number(((s.count / health.total) * 100).toFixed(1)) : 0,
    }));
    databaseHealth.push({ Status: "TOTAL", Jumlah: health.total, Persentase: 100 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ringkasan), "Ringkasan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(databaseHealth), "Database Health");
    XLSX.writeFile(wb, `Agent_Report_${periodeLabel(periodeTo)}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4" /> Export Excel
    </Button>
  );
}
