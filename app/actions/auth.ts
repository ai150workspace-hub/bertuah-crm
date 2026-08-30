"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error?: string;
}

export async function signIn(
  _prevState: SignInState | undefined,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Email atau password salah." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return {
      error: "Akun ini belum terdaftar sebagai user Bertuah CRM. Hubungi admin.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "Akun tidak aktif. Hubungi admin." };
  }

  redirect(profile.role === "admin" ? "/admin/dashboard" : "/agent/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  if (newPassword.length < 6) {
    return { success: false, error: "Password baru minimal 6 karakter." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { success: false, error: "Belum login." };

  // Tidak ada API "verify password" terpisah di Supabase - cara resminya
  // sign-in ulang pakai password lama untuk konfirmasi identitas sebelum
  // ganti, supaya sesi yang lupa ter-logout di komputer bersama tidak bisa
  // dipakai orang lain ganti password tanpa tahu password lama.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { success: false, error: "Password lama salah." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };

  return { success: true };
}
