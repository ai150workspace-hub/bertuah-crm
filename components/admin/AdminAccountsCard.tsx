import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResetPasswordButton } from "./ResetPasswordButton";

export interface AdminAccountRow {
  id: string;
  name: string;
  email: string;
  isRestricted: boolean;
}

export function AdminAccountsCard({
  admins,
  currentUserId,
}: {
  admins: AdminAccountRow[];
  currentUserId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Akun Admin</CardTitle>
        <CardDescription>Semua login admin, termasuk reset password kalau lupa.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {admins.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 font-medium">
                {a.name}
                {a.id === currentUserId && (
                  <Badge variant="outline" className="text-[10px]">
                    Anda
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    a.isRestricted
                      ? "text-[10px] bg-warning/15 text-warning-foreground border-warning/30"
                      : "text-[10px] bg-primary/10 text-primary border-primary/20"
                  }
                >
                  {a.isRestricted ? "Monitoring" : "Admin Penuh"}
                </Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">{a.email}</div>
            </div>
            {a.id === currentUserId ? (
              <span className="text-[11px] text-muted-foreground">
                Pakai menu &quot;Ganti Password&quot; di pojok kanan atas
              </span>
            ) : (
              <ResetPasswordButton userId={a.id} userLabel={a.name} />
            )}
          </div>
        ))}
        {admins.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada akun admin.</p>
        )}
      </CardContent>
    </Card>
  );
}
