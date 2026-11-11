-- Notes on each lead (a dated log, newest first) and an activity log that
-- records everything that happens to leads, for the lead page's History and
-- the Reports page. Run in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run more than once.

-- ------------------------------------------------------------------ notes
create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_notes_lead on public.lead_notes (lead_id, created_at desc);

-- Notes typed before this existed become the lead's first note
insert into public.lead_notes (lead_id, body, author, created_at)
select l.id, l.notes, null, l.updated_at
from public.leads l
where coalesce(trim(l.notes), '') <> ''
  and not exists (select 1 from public.lead_notes n where n.lead_id = l.id);

-- ------------------------------------------------------------------ activity log
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  -- Kept (as null) when the lead is deleted; the name below stays
  lead_id uuid references public.leads(id) on delete set null,
  lead_name text,
  lead_type text,
  -- lead_created, lead_edited, status_changed, follow_up_set, note_added,
  -- opted_out, opted_in, assistant_paused, assistant_on, followups_paused,
  -- followups_on, call_link_tapped, lead_deleted, lead_emailed, email_failed
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  -- Staff email, or "system" (SmartFinancial, texts, the scheduled job)
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index if not exists events_created on public.events (created_at desc);
create index if not exists events_lead on public.events (lead_id, created_at desc);
create index if not exists events_type on public.events (type, created_at desc);

-- Who made the change: the signed-in staff member, or "system"
create or replace function public.current_actor() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', 'system')
$$;

create or replace function public.log_lead_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor text := public.current_actor();
  nm text;
  changed text[];
begin
  if tg_op = 'INSERT' then
    nm := nullif(trim(concat_ws(' ', new.first_name, new.last_name)), '');
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, coalesce(nm, new.business_name), new.lead_type, 'lead_created', jsonb_build_object('source', new.source), actor);
    return new;
  end if;

  if tg_op = 'DELETE' then
    nm := nullif(trim(concat_ws(' ', old.first_name, old.last_name)), '');
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (null, coalesce(nm, old.business_name), old.lead_type, 'lead_deleted',
            jsonb_build_object('status', old.status, 'phone', old.phone, 'email', old.email, 'source', old.source, 'created_at', old.created_at), actor);
    return old;
  end if;

  nm := coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), new.business_name);
  if new.status is distinct from old.status then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status), actor);
  end if;
  if new.follow_up_date is distinct from old.follow_up_date then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, 'follow_up_set', jsonb_build_object('from', old.follow_up_date, 'to', new.follow_up_date), actor);
  end if;
  if new.sms_opted_out is distinct from old.sms_opted_out then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, case when new.sms_opted_out then 'opted_out' else 'opted_in' end, '{}'::jsonb, actor);
  end if;
  if new.bot_paused is distinct from old.bot_paused and not new.sms_opted_out then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, case when new.bot_paused then 'assistant_paused' else 'assistant_on' end, '{}'::jsonb, actor);
  end if;
  if new.followups_paused is distinct from old.followups_paused then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, case when new.followups_paused then 'followups_paused' else 'followups_on' end, '{}'::jsonb, actor);
  end if;
  if old.call_link_clicked_at is null and new.call_link_clicked_at is not null then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, 'call_link_tapped', '{}'::jsonb, 'system');
  end if;

  -- Fields staff edited (contact info, coverage, drivers...)
  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.key not in ('updated_at', 'unread_messages', 'last_message_at', 'last_inbound_at', 'status', 'follow_up_date',
                      'sms_opted_out', 'sms_opted_out_at', 'bot_paused', 'followups_paused', 'welcome_sms_status',
                      'welcome_sms_error', 'welcome_sms_at', 'call_link_clicked_at', 'phone_e164', 'raw_payload', 'notes')
    and n.value is distinct from (to_jsonb(old) -> n.key);
  if changed is not null and actor <> 'system' then
    insert into events (lead_id, lead_name, lead_type, type, detail, actor)
    values (new.id, nm, new.lead_type, 'lead_edited', jsonb_build_object('fields', to_jsonb(changed)), actor);
  end if;
  return new;
end $$;

drop trigger if exists leads_log_insert on public.leads;
create trigger leads_log_insert after insert on public.leads for each row execute function public.log_lead_event();
drop trigger if exists leads_log_update on public.leads;
create trigger leads_log_update after update on public.leads for each row execute function public.log_lead_event();
drop trigger if exists leads_log_delete on public.leads;
create trigger leads_log_delete before delete on public.leads for each row execute function public.log_lead_event();

-- A new note: logged, and kept on the lead as its latest note (for emails and lists)
create or replace function public.log_note_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select id, lead_type, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), business_name) as nm into l from leads where id = new.lead_id;
  insert into events (lead_id, lead_name, lead_type, type, detail, actor)
  values (new.lead_id, l.nm, l.lead_type, 'note_added', jsonb_build_object('note', left(new.body, 300)), public.current_actor());
  update leads set notes = new.body where id = new.lead_id;
  return new;
end $$;
drop trigger if exists lead_notes_log on public.lead_notes;
create trigger lead_notes_log after insert on public.lead_notes for each row execute function public.log_note_event();

drop trigger if exists lead_notes_touch on public.lead_notes;
create trigger lead_notes_touch before update on public.lead_notes for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ access
do $$
declare t text;
begin
  foreach t in array array['lead_notes', 'events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format('create policy "staff full access" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
