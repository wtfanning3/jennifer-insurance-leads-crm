-- Jennifer Richardson Fanning Insurance Agency - Leads CRM
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run.
-- Safe to run more than once.

-- ------------------------------------------------------------------ leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null check (lead_type in ('auto', 'home', 'renters', 'commercial')),
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'sold', 'lost')),
  first_name text,
  last_name text,
  phone text,                 -- as given
  phone_e164 text,            -- +15551234567, used for texting
  email text,
  street text,
  unit text,
  city text,
  state text,
  zip text,
  birthday text,
  gender text,
  marital_status text,
  education text,
  occupation text,
  credit_rating text,
  business_name text,
  -- Existing coverage
  currently_insured text,
  current_carrier text,
  insured_how_long text,
  policy_expires text,
  -- Everything else, by section (Desired Coverage, Driver #1, Vehicle #1,
  -- Home Details, Business Information...) - see lib/fields.ts
  details jsonb not null default '{}'::jsonb,
  follow_up_date date,
  notes text,
  -- A different office number for this lead's "tap to call" link (blank = Settings)
  call_phone text,
  source text not null default 'smartfinancial',
  source_lead_id text,
  raw_payload jsonb,
  -- Texting
  short_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  sms_opted_out boolean not null default false,
  sms_opted_out_at timestamptz,
  bot_paused boolean not null default false,
  followups_paused boolean not null default false,
  welcome_sms_status text not null default 'pending'
    check (welcome_sms_status in ('pending', 'queued', 'sent', 'failed', 'skipped')),
  welcome_sms_error text,
  welcome_sms_at timestamptz,
  call_link_clicked_at timestamptz,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  unread_messages int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_created on public.leads (created_at desc);
create index if not exists leads_phone on public.leads (phone_e164);
create index if not exists leads_follow_up on public.leads (follow_up_date);
create index if not exists leads_welcome on public.leads (welcome_sms_status);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ texts
create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  -- out: welcome / followup / bot / agent / system (STOP confirmation...)
  sender text not null check (sender in ('lead', 'welcome', 'followup', 'bot', 'agent', 'system')),
  body text not null,
  provider text,
  provider_id text,
  status text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists sms_lead on public.sms_messages (lead_id, created_at);
create unique index if not exists sms_provider_id on public.sms_messages (provider, provider_id) where provider_id is not null;

-- ------------------------------------------------------------------ follow-up texts
create table if not exists public.followup_steps (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  name text,
  -- Days after the lead came in (0 = same day)
  delay_days int not null default 1 check (delay_days >= 0),
  -- Earliest hour of the day to send (office time zone, 0-23)
  send_hour int not null default 10 check (send_hour between 0 and 23),
  -- Which lead types get it (empty = all)
  lead_types text[] not null default '{}',
  body text not null,
  enabled boolean not null default true,
  -- Skip this text once the lead has texted back
  stop_if_replied boolean not null default true,
  -- Skip once the lead is Quoted / Sold / Lost
  stop_if_status text[] not null default '{quoted,sold,lost}',
  created_at timestamptz not null default now()
);

create table if not exists public.followup_sends (
  lead_id uuid not null references public.leads(id) on delete cascade,
  step_id uuid not null references public.followup_steps(id) on delete cascade,
  status text not null,  -- sent / failed / skipped
  error text,
  sent_at timestamptz not null default now(),
  primary key (lead_id, step_id)
);

-- Starter follow-up texts (only added when there are none yet)
insert into public.followup_steps (position, name, delay_days, send_hour, body)
select * from (values
  (1, 'Day 1 check-in', 1, 10, 'Hi {first_name}, {agent_name} here with {agency_name}. Just following up on your {lead_type} insurance quote. Is there a good time to chat for 5 minutes? You can reply here or tap to call: {call_link}'),
  (2, 'Day 3 nudge', 3, 11, 'Hi {first_name}, I''d love to help you save on your {lead_type} insurance. Most quotes take about 10 minutes. Want me to call you, or would you rather text? Tap to call anytime: {call_link}'),
  (3, 'Day 7 last try', 7, 14, 'Hi {first_name}, just checking in one more time on your {lead_type} insurance quote. If now isn''t a good time, no problem - reply anytime and we''ll pick it up. {agent_name}, {agency_name}')
) as v(position, name, delay_days, send_hour, body)
where not exists (select 1 from public.followup_steps);

-- ------------------------------------------------------------------ settings (one row)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  -- Agency profile
  agency_name text default 'Jennifer Richardson Fanning Insurance Agency',
  agent_name text default 'Jennifer',
  license_number text default '161620',
  office_phone text,
  office_email text,
  office_address text default 'Fort Collins, CO',
  website_url text default 'https://agents.farmers.com/co/fort-collins/jennifer-richardson-fanning/',
  office_hours text,
  -- Logos (blank = the ones in /public/brand)
  logo_url text,
  icon_url text,
  -- Different office numbers per lead type: {"auto": "...", "home": "..."}
  office_phone_by_type jsonb not null default '{}'::jsonb,
  -- Who gets an email for every new lead (comma or line separated)
  notify_emails text,
  notify_on_reply boolean not null default true,
  -- Texts
  welcome_enabled boolean not null default true,
  -- Welcome text per lead type: {"auto": "...", ...}; blank = the default wording
  welcome_templates jsonb not null default '{}'::jsonb,
  followups_enabled boolean not null default true,
  bot_enabled boolean not null default true,
  -- What the chatbot should know / how it should act
  bot_instructions text,
  -- New texts only go out between these hours (office time zone)
  quiet_start_hour int not null default 20,
  quiet_end_hour int not null default 8,
  time_zone text not null default 'America/Denver',
  last_follow_up_digest date,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------------ access
-- Signed-in staff (Supabase Auth users) can see and change everything; the
-- public cannot. The server (service role) receives leads and texts.
do $$
declare t text;
begin
  foreach t in array array['leads', 'sms_messages', 'followup_steps', 'followup_sends', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format('create policy "staff full access" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Logos: a public storage bucket staff can upload to
insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;
drop policy if exists "staff upload branding" on storage.objects;
create policy "staff upload branding" on storage.objects for insert to authenticated with check (bucket_id = 'branding');
drop policy if exists "staff update branding" on storage.objects;
create policy "staff update branding" on storage.objects for update to authenticated using (bucket_id = 'branding');
drop policy if exists "anyone reads branding" on storage.objects;
create policy "anyone reads branding" on storage.objects for select using (bucket_id = 'branding');

notify pgrst, 'reload schema';
