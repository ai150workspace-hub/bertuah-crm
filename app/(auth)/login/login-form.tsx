"use client";

import { useActionState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
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
import { signIn, type SignInState } from "@/app/actions/auth";

const initialState: SignInState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
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
        <form action={formAction}>
          <CardHeader>
            <CardTitle className="text-base">Masuk ke akun kamu</CardTitle>
            <CardDescription>
              Gunakan email dan password yang diberikan admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nama@bertuahcrm.id"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Memproses..." : "Masuk"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Butuh akses? Hubungi admin operasional Bertuah CRM.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
