-- SubnetPro web: esquema para pegar en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- 1. Perfil de cada usuario (1 a 1 con auth.users)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  tier       text not null default 'free' check (tier in ('free', 'premium')),
  created_at timestamptz not null default now()
);

-- 2. Progreso de estudio (unidades, mazo de repaso, nivel de práctica)
create table if not exists public.progress (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now()
);

-- 3. Mensajes al asistente por día (para el límite diario)
create table if not exists public.chat_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  used       integer not null default 0,
  primary key (user_id, usage_date)
);

-- Seguridad por filas: cada quien solo ve lo suyo.
alter table public.profiles   enable row level security;
alter table public.progress   enable row level security;
alter table public.chat_usage enable row level security;

drop policy if exists "perfil propio: leer" on public.profiles;
create policy "perfil propio: leer" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
-- Sin políticas de insert/update en profiles: el plan solo lo cambia el servidor.

drop policy if exists "progreso propio: leer" on public.progress;
create policy "progreso propio: leer" on public.progress
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "progreso propio: crear" on public.progress;
create policy "progreso propio: crear" on public.progress
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "progreso propio: actualizar" on public.progress;
create policy "progreso propio: actualizar" on public.progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "uso propio: leer" on public.chat_usage;
create policy "uso propio: leer" on public.chat_usage
  for select to authenticated using (user_id = (select auth.uid()));
-- chat_usage solo se escribe con consume_chat(), así nadie se regala mensajes.

-- Crea el perfil al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles de usuarios que ya existían antes de correr este script.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Límite diario de mensajes según el plan. Cámbialo aquí.
create or replace function public.chat_limit(p_tier text)
returns integer language sql immutable as $$
  select case p_tier when 'premium' then 200 else 15 end;
$$;

-- Descuenta un mensaje del día (hora de Colombia) y dice si está permitido.
-- Solo lo llama la Edge Function (service_role) después de validar la sesión.
drop function if exists public.consume_chat();
create or replace function public.consume_chat(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := p_uid;
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_tier  text;
  v_used  integer;
  v_lim   integer;
begin
  if v_uid is null then
    raise exception 'missing_user' using errcode = '22023';
  end if;

  select tier into v_tier from public.profiles where id = v_uid;
  v_lim := public.chat_limit(coalesce(v_tier, 'free'));

  insert into public.chat_usage (user_id, usage_date) values (v_uid, v_today)
  on conflict (user_id, usage_date) do nothing;

  select used into v_used from public.chat_usage
   where user_id = v_uid and usage_date = v_today
     for update;

  if v_used >= v_lim then
    return jsonb_build_object('allowed', false, 'limit', v_lim, 'remaining', 0);
  end if;

  update public.chat_usage set used = used + 1
   where user_id = v_uid and usage_date = v_today;

  return jsonb_build_object('allowed', true, 'limit', v_lim, 'remaining', v_lim - v_used - 1);
end;
$$;

-- Devuelve el mensaje si la IA falló, para no cobrarlo. Solo lo llama el servidor (service_role).
drop function if exists public.refund_chat();
create or replace function public.refund_chat(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_usage set used = greatest(used - 1, 0)
   where user_id = p_uid and usage_date = (now() at time zone 'America/Bogota')::date;
end;
$$;

-- Estado del día sin descontar nada (para mostrar "te quedan N").
create or replace function public.chat_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tier', coalesce(p.tier, 'free'),
    'limit', public.chat_limit(coalesce(p.tier, 'free')),
    'remaining', greatest(public.chat_limit(coalesce(p.tier, 'free')) - coalesce(u.used, 0), 0))
  from (select auth.uid() as id) me
  left join public.profiles p on p.id = me.id
  left join public.chat_usage u on u.user_id = me.id
        and u.usage_date = (now() at time zone 'America/Bogota')::date
  where me.id is not null;
$$;

-- Borrado de cuenta desde la app (lo exige Google Play). Borra en cascada perfil, progreso y uso.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Solo usuarios con sesión pueden llamar a las funciones.
revoke all on function public.consume_chat(uuid)  from public, anon, authenticated;
revoke all on function public.refund_chat(uuid)   from public, anon, authenticated;
revoke all on function public.chat_status()       from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.handle_new_user()   from public, anon, authenticated;
grant execute on function public.consume_chat(uuid)  to service_role;
grant execute on function public.refund_chat(uuid)   to service_role;
grant execute on function public.chat_status()       to authenticated;
grant execute on function public.delete_my_account() to authenticated;
