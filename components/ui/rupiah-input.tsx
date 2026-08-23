"use client";

import { Input } from "@/components/ui/input";

/**
 * Input angka Rupiah dengan titik pemisah ribuan otomatis saat mengetik
 * (mis. "50.000.000"), supaya mitra tidak salah kelebihan/kekurangan nol.
 * `value`/`onChange` bekerja dengan string digit mentah (tanpa titik).
 */
export function RupiahInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (rawDigits: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const formatted = value ? Number(value).toLocaleString("id-ID") : "";

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        Rp
      </span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder={placeholder}
        className="pl-7"
      />
    </div>
  );
}
