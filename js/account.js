// Vista de cuenta: iniciar sesión, registrarse, recuperar contraseña, sincronizar y borrar cuenta.
import { h } from './lib.js';
import { configured, currentUser, signIn, signUp, signOut, recoverPassword, updatePassword, rpc } from './supa.js';
import { syncStatus, onSync } from './sync.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(id, label, attrs) {
  return h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('input', { class: 'input input--text', id, ...attrs }),
    h('span', { class: 'err', id: `${id}-err`, hidden: true }));
}

function setErr(form, id, msg) {
  const input = form.querySelector(`#${id}`);
  const err = form.querySelector(`#${id}-err`);
  input.setAttribute('aria-invalid', String(!!msg));
  if (msg) input.setAttribute('aria-describedby', `${id}-err`); else input.removeAttribute('aria-describedby');
  err.hidden = !msg;
  err.textContent = msg ?? '';
  return !msg;
}

function notice(kind, text) {
  return h('p', { class: `notice notice--${kind}`, role: kind === 'error' ? 'alert' : 'status', text });
}

/** Deshabilita el botón y muestra "Enviando…" mientras dura la petición. */
async function busy(btn, label, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = original; }
}

function head(title, lead) {
  return h('header', { class: 'view-head' },
    h('h1', { tabindex: '-1', text: title }),
    lead ? h('p', { class: 'lead', text: lead }) : null);
}

function loginForm(go) {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Iniciar sesión' });
  const form = h('form', { class: 'panel form-narrow', novalidate: true },
    field('l-email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    field('l-pass', 'Contraseña', { type: 'password', autocomplete: 'current-password', required: true }),
    out,
    h('div', { class: 'row order-actions' }, btn,
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Olvidé mi contraseña', onclick: () => go('recuperar') })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('#l-email').value.trim();
    const pass = form.querySelector('#l-pass').value;
    const ok1 = setErr(form, 'l-email', EMAIL_RE.test(email) ? null : 'Escribe un correo válido.');
    const ok2 = setErr(form, 'l-pass', pass ? null : 'Escribe tu contraseña.');
    if (!ok1 || !ok2) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    out.replaceChildren();
    try { await busy(btn, 'Entrando…', () => signIn(email, pass)); } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });
  return form;
}

function signupForm() {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Crear cuenta gratis' });
  const form = h('form', { class: 'panel form-narrow', novalidate: true },
    field('s-email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    field('s-pass', 'Contraseña', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true }),
    h('p', { class: 'hint', text: 'Mínimo 8 caracteres. Guardamos solo tu correo y tu progreso de estudio; puedes borrar la cuenta cuando quieras.' }),
    out,
    h('div', { class: 'row order-actions' }, btn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('#s-email').value.trim();
    const pass = form.querySelector('#s-pass').value;
    const ok1 = setErr(form, 's-email', EMAIL_RE.test(email) ? null : 'Escribe un correo válido.');
    const ok2 = setErr(form, 's-pass', pass.length >= 8 ? null : 'Usa al menos 8 caracteres.');
    if (!ok1 || !ok2) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    out.replaceChildren();
    try {
      const r = await busy(btn, 'Creando…', () => signUp(email, pass));
      if (r.needsConfirmation) {
        form.replaceChildren(
          h('h2', { tabindex: '-1', text: 'Revisa tu correo' }),
          h('p', { text: `Te enviamos un enlace a ${email}. Ábrelo en este mismo navegador para activar la cuenta. Si no llega en unos minutos, revisa la carpeta de spam.` }));
        form.querySelector('h2').focus();
      }
    } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });
  return form;
}

function recoverForm(go) {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Enviar enlace' });
  const form = h('form', { class: 'panel form-narrow', novalidate: true },
    h('p', { text: 'Te enviamos un enlace para crear una contraseña nueva.' }),
    field('r-email', 'Correo de tu cuenta', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    out,
    h('div', { class: 'row order-actions' }, btn,
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Volver', onclick: () => go('entrar') })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('#r-email').value.trim();
    if (!setErr(form, 'r-email', EMAIL_RE.test(email) ? null : 'Escribe un correo válido.')) { form.querySelector('#r-email').focus(); return; }
    try {
      await busy(btn, 'Enviando…', () => recoverPassword(email));
      out.replaceChildren(notice('ok', 'Si el correo tiene cuenta, el enlace ya va en camino.'));
    } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });
  return form;
}

export function renderNewPassword(root) {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Guardar contraseña' });
  const form = h('form', { class: 'panel form-narrow', novalidate: true },
    field('n-pass', 'Contraseña nueva', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true }),
    out,
    h('div', { class: 'row order-actions' }, btn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = form.querySelector('#n-pass').value;
    if (!setErr(form, 'n-pass', pass.length >= 8 ? null : 'Usa al menos 8 caracteres.')) return;
    try {
      await busy(btn, 'Guardando…', () => updatePassword(pass));
      location.hash = '#cuenta';
    } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });
  root.replaceChildren(h('div', { class: 'enter' }, head('Crea tu contraseña nueva'), form));
}

function syncLine() {
  const p = h('p', { 'aria-live': 'polite' });
  const draw = (s) => {
    const text = {
      idle: 'Tu progreso se sincroniza al iniciar sesión y después de cada respuesta.',
      syncing: 'Sincronizando…',
      ok: `Progreso sincronizado a las ${s.at?.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) ?? ''}`,
      error: `No se pudo sincronizar: ${s.message}`,
    }[s.state];
    p.textContent = text;
    p.className = s.state === 'error' ? 'notice notice--error' : '';
  };
  draw(syncStatus);
  const off = onSync((s) => { if (p.isConnected) draw(s); else off(); });
  return p;
}

function loggedIn(root, { onSyncNow, onDeleted }) {
  const user = currentUser();
  const plan = h('dd', { class: 'mono', text: '…' });
  rpc('chat_status').then((s) => { plan.textContent = s?.tier === 'premium' ? 'Premium' : 'Gratis'; }).catch(() => { plan.textContent = 'No disponible'; });

  const del = h('dialog', { 'aria-labelledby': 'del-h' },
    h('form', { method: 'dialog', class: 'dialog' },
      h('h2', { id: 'del-h', text: '¿Borrar tu cuenta?' }),
      h('p', { text: 'Se eliminan tu cuenta, tu progreso guardado en el servidor y tu historial de uso. El progreso de este navegador se conserva. No se puede deshacer.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--ghost', value: 'cancel', text: 'Cancelar' }),
        h('button', { class: 'btn btn--danger', value: 'ok', text: 'Borrar mi cuenta' }))));
  const out = h('div', { 'aria-live': 'polite' });
  del.addEventListener('close', async () => {
    if (del.returnValue !== 'ok') return;
    try { await rpc('delete_my_account'); await signOut(); onDeleted(); } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });

  const logout = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Cerrar sesión' });
  logout.addEventListener('click', () => busy(logout, 'Cerrando…', signOut));

  root.replaceChildren(h('div', { class: 'enter' },
    head('Tu cuenta'),
    h('section', { class: 'panel form-narrow', 'aria-label': 'Datos de la cuenta' },
      h('dl', { class: 'acct' },
        h('dt', { text: 'Correo' }), h('dd', { class: 'mono', text: user?.email ?? 'Cargando…' }),
        h('dt', { text: 'Plan' }), plan),
      syncLine(),
      h('div', { class: 'row order-actions' },
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Sincronizar ahora', onclick: onSyncNow }),
        logout)),
    h('section', { class: 'panel form-narrow', 'aria-labelledby': 'zone-h' },
      h('h2', { id: 'zone-h', text: 'Borrar cuenta' }),
      h('p', { text: 'Elimina tu cuenta y los datos guardados en el servidor.' }),
      out,
      h('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar mi cuenta', onclick: () => del.showModal() })),
    del));
}

export function renderAccount(root, opts) {
  if (!configured) {
    root.replaceChildren(h('section', { class: 'panel state enter' },
      h('h1', { tabindex: '-1', text: 'Las cuentas aún no están activadas' }),
      h('p', { text: 'Esta versión funciona sin cuenta: tu progreso se guarda en este navegador. Las cuentas se activan al conectar Supabase en js/config.js.' }),
      h('a', { class: 'btn btn--primary', href: '#inicio', text: 'Volver al inicio' })));
    return;
  }
  if (currentUser()) { loggedIn(root, opts); return; }

  let mode = opts.mode ?? 'entrar';
  const draw = () => {
    const holder = mode === 'crear' ? signupForm() : mode === 'recuperar' ? recoverForm(go) : loginForm(go);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Acceso' },
      h('button', { type: 'button', 'aria-pressed': String(mode !== 'crear'), onclick: () => go('entrar') }, 'Iniciar sesión'),
      h('button', { type: 'button', 'aria-pressed': String(mode === 'crear'), onclick: () => go('crear') }, 'Crear cuenta'));
    root.replaceChildren(h('div', { class: 'enter' },
      head('Tu cuenta', 'Con una cuenta gratis tu progreso queda guardado aunque cambies de celular, y puedes usar el asistente de redes.'),
      opts.message ? notice(opts.message.kind, opts.message.text) : null,
      seg,
      h('div', { class: 'order-actions' }, holder)));
    opts.message = null;
  };
  function go(m) { mode = m; draw(); root.querySelector('input')?.focus(); }
  draw();
}
