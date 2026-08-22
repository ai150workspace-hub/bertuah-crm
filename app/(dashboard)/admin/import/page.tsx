import { ImportWizard } from "@/components/admin/import-wizard";
import { AgentCapacityPanel } from "@/components/admin/agent-capacity-panel";
import { getAgentCapacities } from "@/app/actions/import";

export default async function AdminImportPage() {
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
