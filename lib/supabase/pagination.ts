// PostgREST/Supabase membatasi hasil SATU query ke 1.000 baris SECARA DIAM-
// DIAM kalau tidak pakai .range() atau count:"exact" - tidak ada error,
// tidak ada peringatan, cuma baris yang hilang begitu saja. Kejadian nyata
// di produksi: public.contacts sudah 1.404 baris, dua tempat yang menarik
// "semua kontak" tanpa paginasi diam-diam cuma dapat 1.000 - Health
// Database menampilkan angka bulat 1.000 (tandanya kepotong), dan
// kapasitas agen jadi terbaca lebih kosong dari kenyataan.
//
// Helper ini menarik SEMUA baris lewat .range() berulang, berhenti begitu
// satu halaman pulang lebih pendek dari ukuran halaman (tanda itu halaman
// terakhir). Pakai ini SETIAP KALI butuh seluruh isi tabel yang bisa terus
// tumbuh - jangan .select() polos tanpa .range()/count, supaya orang
// berikutnya tidak menulis ulang bug yang sama.
export async function fetchAllRows<T>(
  queryForRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryForRange(from, from + pageSize - 1);
    if (error) throw error;

    const rows = data ?? [];
    all.push(...rows);

    if (rows.length < pageSize) break; // halaman terakhir
    from += pageSize;
  }

  return all;
}
