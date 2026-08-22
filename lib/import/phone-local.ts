// Normalisasi nomor HP untuk kolom contacts.no_hp — format lokal '0812...',
// BUKAN format '628...' yang dipakai lib/telephony/phone.ts. Dua konvensi
// ini sengaja berbeda: contacts.no_hp adalah field tampilan CRM biasa
// (mengikuti data yang sudah ada), sementara format telephony khusus
// untuk pencocokan call_sessions/rekaman.
export function normalizePhoneLocal(input: string | null | undefined): string | null {
  if (!input) return null;

  let d = String(input).replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("620")) d = "0" + d.slice(3);
  else if (d.startsWith("62")) d = "0" + d.slice(2);
  else if (d.startsWith("8")) d = "0" + d;

  if (!d.startsWith("0")) return null;
  if (d.length < 10 || d.length > 14) return null;

  return d;
}
