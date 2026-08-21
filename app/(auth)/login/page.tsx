import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5.5 w-5.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Bertuah CRM</h1>
            <p className="text-sm text-muted-foreground">
              Multiguna Jaminan BPKB Mobil &amp; Motor · Pekanbaru
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Masuk ke akun kamu</CardTitle>
            <CardDescription>
              Gunakan email dan password yang diberikan admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="nama@bertuahcrm.id" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Fase ini masih UI preview — autentikasi sungguhan akan aktif
                setelah Supabase terhubung. Gunakan tombol demo di bawah untuk
                melihat workspace masing-masing role.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                nativeButton={false}
                render={<Link href="/agent/dashboard">Demo Agent</Link>}
              />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/admin/dashboard">Demo Admin</Link>}
              />
            </div>
            <Separator />
            <p className="text-center text-xs text-muted-foreground">
              Butuh akses? Hubungi admin operasional Bertuah CRM.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
