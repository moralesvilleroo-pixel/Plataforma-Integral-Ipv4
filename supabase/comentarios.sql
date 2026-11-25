-- Comentarios de testers y usuarios. Pégalo en SQL Editor > New query > Run.
-- Cualquiera puede ENVIAR un comentario (con o sin cuenta), pero nadie puede leerlos desde la app:
-- solo tú, desde Table Editor > feedback.

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  rating     smallint check (rating between 1 and 5),
  kind       text not null check (kind in ('error', 'idea', 'otro')),
  message    text not null check (char_length(message) between 5 and 1500),
  contact    text check (contact is null or char_length(contact) <= 120),
  device     text check (device is null or char_length(device) <= 300),
  page       text check (page is null or char_length(page) <= 120)
);

alter table public.feedback enable row level security;

drop policy if exists "enviar comentario" on public.feedback;
create policy "enviar comentario" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Sin políticas de select, update ni delete: los comentarios no se pueden leer ni borrar desde fuera.
revoke select, update, delete on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;
