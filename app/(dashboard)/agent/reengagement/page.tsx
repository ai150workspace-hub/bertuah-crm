import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getReengagementLeads } from "@/lib/reengagement";
import { getWaTemplate } from "@/lib/wa-templates";
import { ReengagementActions } from "@/components/agent/ReengagementActions";

export default async function ReengagementPage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();

  // 2 query independen - jalan bareng.
  const [leads, template] = profile
    ? await Promise.all([
        getReengagementLeads(supabase, profile.id),
        getWaTemplate("reengagement"),
      ])
    : [[], null];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-up Ulang</h1>
        <p className="text-sm text-muted-foreground">
          Kontak Closed (bukan &ldquo;Tidak lolos syarat&rdquo;) yang sudah 30 hari tidak
          ditindaklanjuti — layak dihubungi ulang. Tidak masuk kapasitas/antrean drip biasa.
        </p>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead>Alasan Terakhir</TableHead>
              <TableHead>Terakhir Dihubungi</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  {lead.nama}
                  <div className="text-xs text-muted-foreground">{lead.noHp}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{lead.merkTipe}</div>
                  <div className="text-xs text-muted-foreground">
                    {lead.jenisKendaraan} · {lead.tahun ?? "—"}
                  </div>
                </TableCell>
                <TableCell>{lead.lastOutcomeLabel}</TableCell>
                <TableCell>
                  {new Date(lead.lastContactedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <ReengagementActions lead={lead} templateText={template?.templateText ?? null} />
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Belum ada lead yang layak di-follow-up ulang saat ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
