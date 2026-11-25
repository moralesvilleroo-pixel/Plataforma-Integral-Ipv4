// Formulario de comentarios: guarda en la tabla feedback de Supabase.
import { configured, currentUser, sendFeedback } from './supa.js';

const form = document.getElementById('fb-form');
const out = document.getElementById('fb-out');
const btn = form.querySelector('button[type="submit"]');
const MIN = 5;

function setErr(id, msg) {
  const input = document.getElementById(id);
  const err = document.getElementById(`${id}-err`);
  input.setAttribute('aria-invalid', String(!!msg));
  if (msg) input.setAttribute('aria-describedby', `${id}-err`); else input.removeAttribute('aria-describedby');
  err.hidden = !msg;
  err.textContent = msg ?? '';
  return !msg;
}

function notice(kind, text) {
  const p = document.createElement('p');
  p.className = `notice notice--${kind}`;
  p.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  p.textContent = text;
  out.replaceChildren(p);
}

if (!configured) {
  notice('error', 'Los comentarios aún no están activados en esta versión.');
  btn.disabled = true;
}

const user = currentUser();
if (user?.email) document.getElementById('fb-contact').value = user.email;

const msg = document.getElementById('fb-msg');
const count = document.getElementById('fb-count');
msg.addEventListener('input', () => {
  count.textContent = `${msg.value.length}/1500`;
  if (msg.value.trim().length >= MIN) setErr('fb-msg', null);
});
for (const r of form.querySelectorAll('input[name="kind"]')) r.addEventListener('change', () => setErr('fb-kind', null));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Campo trampa: las personas no lo ven; los bots que llenan todo, sí.
  if (document.getElementById('fb-web').value) return;
  const kind = form.querySelector('input[name="kind"]:checked')?.value;
  const ratingRaw = form.querySelector('input[name="rating"]:checked')?.value;
  const text = msg.value.trim();
  const contact = document.getElementById('fb-contact').value.trim();

  const ok1 = setErr('fb-kind', kind ? null : 'Elige de qué se trata.');
  const ok2 = setErr('fb-msg', text.length >= MIN ? null : 'Cuéntanos un poco más (mínimo 5 caracteres).');
  const ok3 = setErr('fb-contact', !contact || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? null : 'Ese correo no es válido. También puedes dejarlo vacío.');
  if (!ok1 || !ok2 || !ok3) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    await sendFeedback({
      kind,
      rating: ratingRaw ? Number(ratingRaw) : null,
      message: text.slice(0, 1500),
      contact: contact || null,
      device: navigator.userAgent.slice(0, 300),
      page: new URLSearchParams(location.search).get('desde')?.slice(0, 120) ?? null,
    });
    form.reset();
    count.textContent = '0/1500';
    notice('ok', 'Gracias. Tu comentario llegó y lo vamos a leer.');
  } catch (err) {
    notice('error', `No se pudo enviar: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar comentario';
  }
});
