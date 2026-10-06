/**
 * Batas percobaan telepon per nomor - sama dengan pagar "< 3 baris call_logs"
 * di assign_contacts_to_agent (migrasi 0027) dan filter "Kerjakan Hari Ini"
 * (lib/contacts.ts). File terpisah (tanpa import server) supaya komponen
 * klien seperti QueueTable.tsx dan customer-drawer.tsx bisa memakainya.
 */
export const BATAS_PERCOBAAN = 3;
