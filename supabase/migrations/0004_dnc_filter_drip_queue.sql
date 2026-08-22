-- =====================================================================
-- 0004_dnc_filter_drip_queue.sql
--
-- Tutup lubang yang disebut eksplisit di docs/TELEPHONY.md Prompt 10:
-- tanpa filter ini, JANGAN_HUBUNGI cuma jadi catatan tanpa akibat, dan
-- kontak yang sudah minta berhenti dihubungi akan ditelepon lagi oleh
-- mitra berikutnya — persis yang dilarang POJK 6/2022.
-- =====================================================================

create or replace function public.assign_contacts_to_agent(
  p_agent_id uuid,
  p_batch_size int default 15
)
returns setof public.contacts
language plpgsql
security definer
as $$
declare
  v_contact_ids uuid[];
begin
  select array_agg(id) into v_contact_ids
  from (
    select id from public.contacts
    where status_call = 'Uncalled'
      and assigned_to is null
      and not exists (
        select 1 from public.do_not_contact d
        where d.no_hp = contacts.no_hp
      )
      and coalesce(contacts.consent_status, 'Belum Ada') <> 'Ditarik'
    order by created_at asc
    limit p_batch_size
    for update skip locked
  ) sub;

  if v_contact_ids is null or array_length(v_contact_ids, 1) = 0 then
    return;
  end if;

  update public.contacts
  set
    assigned_to = p_agent_id,
    assigned_at = now()
  where id = any(v_contact_ids);

  return query
  select * from public.contacts
  where id = any(v_contact_ids);
end;
$$;
