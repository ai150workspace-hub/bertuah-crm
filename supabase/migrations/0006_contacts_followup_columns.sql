-- FinMatch_PKU_PRD.md's contacts table (which 0001 was built from) never
-- had follow-up/last-contact tracking columns, but efekSamping() in
-- lib/call-outcome/derive.ts produces `jadwalkanPada` specifically so a
-- contact resurfaces in the agent's queue on the promised day (PIKIR_PIKIR
-- auto-schedules H+3, JANJI_TEMU/KONFIRMASI_PASANGAN/MINTA_TELEPON_LAIN use
-- the agent's own date). Without a column to store it, that whole mechanic
-- has nowhere to land.
alter table public.contacts
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_follow_up_at timestamptz;

create index if not exists idx_contacts_next_follow_up
  on public.contacts(next_follow_up_at)
  where next_follow_up_at is not null;
