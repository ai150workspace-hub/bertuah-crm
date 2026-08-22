-- =====================================================================
-- 0007_import_capacity.sql — CSV/XLSX import + kapasitas agent
-- =====================================================================

alter table public.users
  add column if not exists kapasitas_data int not null default 50
    check (kapasitas_data >= 0);

alter table public.data_batches
  add column if not exists mode_distribusi text
    check (mode_distribusi in ('auto', 'manual', 'unassigned'));

-- Index untuk hitung cepat "sisa kapasitas" (Uncalled per agent).
create index if not exists idx_contacts_assigned_uncalled
  on public.contacts(assigned_to)
  where status_call = 'Uncalled';
