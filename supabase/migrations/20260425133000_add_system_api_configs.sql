create table if not exists public.system_api_configs (
  service text primary key,
  api_key text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint system_api_configs_service_check check (service in ('openai', 'resend'))
);

alter table public.system_api_configs enable row level security;

drop policy if exists "No direct access to system_api_configs" on public.system_api_configs;
create policy "No direct access to system_api_configs"
on public.system_api_configs
for all
to authenticated
using (false)
with check (false);

insert into public.system_api_configs (service, api_key)
values ('openai', ''), ('resend', '')
on conflict (service) do nothing;
