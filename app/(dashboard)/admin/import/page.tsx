import { ShieldOff } from "lucide-react";
import { ImportWizard } from "@/components/admin/import-wizard";
import { AgentCapacityPanel } from "@/components/admin/agent-capacity-panel";
import { getAgentCapacities } from "@/app/actions/import";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminImportPage() {
  const profile = await getCurrentUser();

  // Admin monitoring tidak boleh import data - dicek di sini juga (bukan
  // cuma disembunyikan dari sidebar), supaya tetap terblokir kalau URL
  // diketik langsung. Server action commitImport() (app/actions/import.ts)
  // juga menolak di level yang sama, jadi ini bukan satu-satunya lapis.
  if (profile?.isRestrictedAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Akses ke halaman ini dibatasi.</p>
          <p className="text-sm text-muted-foreground">
            Akun Anda hanya untuk monitoring, tidak bisa mengimpor data baru.
          </p>
        </div>
      </div>
    );
  }

  const agents = await getAgentCapacities();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <p className="text-sm text-muted-foreground">
          Upload database kontak baru dan distribusikan ke agent.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ImportWizard agents={agents} />
        </div>
        <AgentCapacityPanel agents={agents} />
      </div>
    </div>
  );
}
