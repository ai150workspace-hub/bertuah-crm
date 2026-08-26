import { getAllLeasingPartners } from "@/lib/leasing-partners";
import { LeasingPartnersManager } from "@/components/admin/LeasingPartnersManager";

export default async function AdminLeasingPage() {
  const partners = await getAllLeasingPartners();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leasing Partners</h1>
        <p className="text-sm text-muted-foreground">
          Daftar perusahaan leasing yang bisa dipilih agent saat mengajukan aplikasi baru.
        </p>
      </div>

      <LeasingPartnersManager partners={partners} />
    </div>
  );
}
