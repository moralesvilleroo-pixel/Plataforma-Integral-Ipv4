-- Arreglo 01: el asistente usa la sesión del estudiante y ya no necesita llaves secretas.
-- Pégalo en SQL Editor > New query > Run. Se puede ejecutar más de una vez.

drop function if exists public.consume_chat(uuid);
drop function if exists public.refund_chat(uuid);
drop function if exists public.refund_chat();

-- Descuenta un mensaje del día al estudiante que llama (hora de Colombia).
-- Si alguien la llama por su cuenta, solo gasta sus propias preguntas.
create or replace function public.consume_chat()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_tier  text;
  v_used  integer;
  v_lim   integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
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

revoke all on function public.consume_chat() from public, anon;
grant execute on function public.consume_chat() to authenticated;
