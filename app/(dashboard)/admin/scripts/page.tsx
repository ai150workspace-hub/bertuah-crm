import { getAllScriptContent } from "@/lib/scripts";
import { getAllWaTemplates } from "@/lib/wa-templates";
import { ScriptsManager } from "@/components/admin/scripts/ScriptsManager";

export default async function AdminScriptsPage() {
  // 2 query independen - jalan bareng.
  const [scripts, waTemplates] = await Promise.all([getAllScriptContent(), getAllWaTemplates()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Kelola Script &amp; WA Template</h1>
        <p className="text-sm text-muted-foreground">
          Konten panduan call (sidebar agent) dan template pesan WhatsApp — berubah di sini
          langsung terlihat agent, tanpa perlu deploy ulang.
        </p>
      </div>

      <ScriptsManager scripts={scripts} waTemplates={waTemplates} />
    </div>
  );
}
