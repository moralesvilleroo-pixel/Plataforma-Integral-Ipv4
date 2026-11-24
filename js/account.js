// Cuenta: pantalla de acceso con panel deslizante, Google, recuperación, sincronización e instalación.
import { h } from './lib.js';
import { configured, currentUser, signIn, signUp, signOut, signInWithGoogle, recoverPassword, updatePassword, rpc } from './supa.js';
import { syncStatus, onSync } from './sync.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SVG_NS = 'http://www.w3.org/2000/svg';

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

async function busy(btn, label, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = original; } }
}

function head(title, lead) {
  return h('header', { class: 'view-head' },
    h('h1', { tabindex: '-1', text: title }),
    lead ? h('p', { class: 'lead', text: lead }) : null);
}

/** Logo oficial de Google en sus colores, como piden sus normas de marca para el botón de acceso. */
function googleLogo() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'g-logo');
  const paths = [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ];
  for (const [fill, d] of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function googleButton(out) {
  const btn = h('button', { class: 'btn btn--google', type: 'button' }, googleLogo(), h('span', { text: 'Continuar con Google' }));
  btn.addEventListener('click', () => {
    btn.disabled = true;
    try { signInWithGoogle(); } catch (err) { btn.disabled = false; out.replaceChildren(notice('error', err.message)); }
  });
  return btn;
}

/** Topología de una LAN pequeña: es el motivo del panel de acceso. */
function topology() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 220');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'topo');
  const add = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
    return el;
  };
  const router = [160, 40];
  const switches = [[80, 110], [240, 110]];
  const hosts = [[40, 180], [100, 185], [150, 178], [200, 182], [255, 186], [295, 175]];
  for (const s of switches) add('line', { x1: router[0], y1: router[1], x2: s[0], y2: s[1], class: 'topo__link topo__link--up' });
  hosts.forEach((p, i) => {
    const s = switches[i < 3 ? 0 : 1];
    add('line', { x1: s[0], y1: s[1], x2: p[0], y2: p[1], class: 'topo__link' });
  });
  add('rect', { x: router[0] - 22, y: router[1] - 14, width: 44, height: 28, rx: 8, class: 'topo__router' });
  for (const s of switches) add('rect', { x: s[0] - 18, y: s[1] - 10, width: 36, height: 20, rx: 5, class: 'topo__switch' });
  for (const p of hosts) add('circle', { cx: p[0], cy: p[1], r: 7, class: 'topo__host' });
  const label = add('text', { x: router[0], y: router[1] + 5, 'text-anchor': 'middle', class: 'topo__text' });
  label.textContent = '/24';
  return svg;
}

function loginForm(go) {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Iniciar sesión' });
  const form = h('form', { class: 'auth__form', novalidate: true, 'aria-labelledby': 'login-h' },
    h('h2', { id: 'login-h', text: 'Inicia sesión' }),
    googleButton(out),
    h('p', { class: 'auth__or', text: 'o con tu correo' }),
    field('l-email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    field('l-pass', 'Contraseña', { type: 'password', autocomplete: 'current-password', required: true }),
    out,
    btn,
    h('button', { class: 'link-btn', type: 'button', text: 'Olvidé mi contraseña', onclick: () => go('recuperar') }));
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
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Crear cuenta gratis' });
  const form = h('form', { class: 'auth__form', novalidate: true, 'aria-labelledby': 'signup-h' },
    h('h2', { id: 'signup-h', text: 'Crea tu cuenta' }),
    googleButton(out),
    h('p', { class: 'auth__or', text: 'o con tu correo' }),
    field('s-email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    field('s-pass', 'Contraseña', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true }),
    h('p', { class: 'hint', text: 'Mínimo 8 caracteres. Guardamos solo tu correo y tu progreso; puedes borrar la cuenta cuando quieras.' }),
    out,
    btn);
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
          h('p', { text: `Te enviamos un enlace a ${email}. Ábrelo en este mismo navegador para activar la cuenta. Si no llega en unos minutos, revisa spam.` }));
        form.querySelector('h2').focus();
      }
    } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });
  return form;
}

function recoverForm(go) {
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit', text: 'Enviar enlace' });
  const form = h('form', { class: 'auth__form', novalidate: true, 'aria-labelledby': 'rec-h' },
    h('h2', { id: 'rec-h', text: 'Recupera tu contraseña' }),
    h('p', { class: 'hint', text: 'Te enviamos un enlace para crear una contraseña nueva.' }),
    field('r-email', 'Correo de tu cuenta', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true }),
    out,
    btn,
    h('button', { class: 'link-btn', type: 'button', text: 'Volver a iniciar sesión', onclick: () => go('entrar') }));
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

/** Pantalla de acceso: un panel con la topología se desliza para cambiar entre entrar y crear cuenta. */
function authScreen(root, opts) {
  let mode = opts.mode === 'crear' ? 'crear' : 'entrar';
  const leftPane = h('div', { class: 'auth__pane auth__pane--left' });
  const rightPane = h('div', { class: 'auth__pane auth__pane--right' });
  const panelText = h('div', { class: 'auth__copy', 'aria-live': 'polite' });
  const swap = h('button', { class: 'btn btn--ghost btn--onpanel', type: 'button' });
  const panel = h('div', { class: 'auth__panel' }, topology(), panelText, swap);
  const card = h('section', { class: 'auth', 'aria-label': 'Acceso a tu cuenta' }, leftPane, rightPane, panel);

  function go(next) {
    mode = next;
    // Escritorio: crear cuenta vive a la izquierda y entrar a la derecha; el panel tapa el lado inactivo.
    leftPane.replaceChildren(signupForm());
    rightPane.replaceChildren(mode === 'recuperar' ? recoverForm(go) : loginForm(go));
    card.dataset.mode = mode === 'crear' ? 'crear' : 'entrar';
    const creating = mode === 'crear';
    leftPane.inert = !creating;
    rightPane.inert = creating;
    panelText.replaceChildren(
      h('h2', { text: creating ? '¿Ya tienes cuenta?' : '¿Primera vez en SubnetPro?' }),
      h('p', { text: creating
        ? 'Entra para recuperar tu progreso en cualquier celular.'
        : 'Crea una cuenta gratis: tu progreso queda guardado y puedes usar el asistente de redes.' }));
    swap.textContent = creating ? 'Iniciar sesión' : 'Crear cuenta';
  }
  swap.addEventListener('click', () => {
    go(mode === 'crear' ? 'entrar' : 'crear');
    (mode === 'crear' ? leftPane : rightPane).querySelector('input')?.focus({ preventScroll: true });
  });

  go(mode);
  root.replaceChildren(h('div', { class: 'enter auth-wrap' },
    h('h1', { class: 'visually-hidden', tabindex: '-1', text: 'Tu cuenta' }),
    opts.message ? notice(opts.message.kind, opts.message.text) : null,
    card,
    deviceSection(opts),
    legalLinks()));
  opts.message = null;
}

function syncLine() {
  const p = h('p', { 'aria-live': 'polite' });
  const draw = (s) => {
    p.textContent = {
      idle: 'Tu progreso se sincroniza al iniciar sesión y después de cada respuesta.',
      syncing: 'Sincronizando…',
      ok: `Progreso sincronizado a las ${s.at?.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) ?? ''}`,
      error: `No se pudo sincronizar: ${s.message}`,
    }[s.state];
    p.className = s.state === 'error' ? 'notice notice--error' : 'muted';
  };
  draw(syncStatus);
  const off = onSync((s) => { if (p.isConnected) draw(s); else off(); });
  return p;
}

function legalLinks() {
  return h('p', { class: 'legal' },
    h('a', { href: 'privacidad.html', text: 'Política de privacidad' }),
    h('a', { href: 'eliminar-cuenta.html', text: 'Cómo borrar tu cuenta' }));
}

function deviceSection(opts) {
  const install = opts.canInstall()
    ? h('button', { class: 'btn btn--primary', type: 'button', text: 'Instalar la app', onclick: async (e) => { await opts.onInstall(); e.target.remove(); } })
    : null;
  return h('section', { class: 'panel', 'aria-labelledby': 'dev-h' },
    h('h2', { id: 'dev-h', text: 'Este dispositivo' }),
    h('p', { class: 'muted', text: install
      ? 'Instálala para abrirla desde tu pantalla de inicio, a pantalla completa y sin internet.'
      : 'Tu progreso se guarda aquí aunque no tengas internet.' }),
    h('div', { class: 'row' }, install,
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Borrar progreso de este dispositivo', onclick: () => document.getElementById('confirm').showModal() })));
}

function loggedIn(root, opts) {
  const user = currentUser();
  const plan = h('dd', { text: '…' });
  rpc('chat_status').then((s) => { plan.textContent = s?.tier === 'premium' ? 'Premium' : 'Gratis'; }).catch(() => { plan.textContent = 'No disponible'; });

  const del = h('dialog', { 'aria-labelledby': 'del-h' },
    h('form', { method: 'dialog', class: 'dialog' },
      h('h2', { id: 'del-h', text: '¿Borrar tu cuenta?' }),
      h('p', { text: 'Se eliminan tu cuenta, tu progreso guardado en la nube y tu historial de uso. Lo guardado en este dispositivo se conserva. No se puede deshacer.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--ghost', value: 'cancel', text: 'Cancelar' }),
        h('button', { class: 'btn btn--danger', value: 'ok', text: 'Borrar mi cuenta' }))));
  const out = h('div', { 'aria-live': 'polite' });
  del.addEventListener('close', async () => {
    if (del.returnValue !== 'ok') return;
    try { await rpc('delete_my_account'); await signOut(); opts.onDeleted(); } catch (err) { out.replaceChildren(notice('error', err.message)); }
  });

  const logout = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Cerrar sesión' });
  logout.addEventListener('click', () => busy(logout, 'Cerrando…', signOut));
  const initial = (user?.name ?? user?.email ?? '?').trim().charAt(0).toUpperCase();

  root.replaceChildren(h('div', { class: 'enter account' },
    head('Tu cuenta'),
    opts.message ? notice(opts.message.kind, opts.message.text) : null,
    h('section', { class: 'panel profile', 'aria-label': 'Datos de la cuenta' },
      h('span', { class: 'profile__avatar', 'aria-hidden': 'true', text: initial }),
      h('div', { class: 'profile__body' },
        h('p', { class: 'profile__name', text: user?.name ?? user?.email ?? 'Cargando…' }),
        user?.name ? h('p', { class: 'muted mono', text: user.email }) : null,
        h('dl', { class: 'acct' },
          h('dt', { text: 'Plan' }), plan,
          h('dt', { text: 'Acceso' }), h('dd', { text: user?.provider === 'google' ? 'Google' : 'Correo y contraseña' })),
        syncLine(),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', text: 'Sincronizar ahora', onclick: opts.onSyncNow }),
          logout))),
    deviceSection(opts),
    h('section', { class: 'panel', 'aria-labelledby': 'zone-h' },
      h('h2', { id: 'zone-h', text: 'Borrar cuenta' }),
      h('p', { class: 'muted', text: 'Elimina tu cuenta y los datos guardados en la nube.' }),
      out,
      h('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar mi cuenta', onclick: () => del.showModal() })),
    legalLinks(),
    del));
  opts.message = null;
}

export function renderAccount(root, opts) {
  if (!configured) {
    root.replaceChildren(h('div', { class: 'enter account' },
      head('Tu cuenta', 'Las cuentas aún no están activadas en esta versión: tu progreso se guarda en este dispositivo.'),
      deviceSection(opts),
      legalLinks()));
    return;
  }
  if (currentUser()) loggedIn(root, opts);
  else authScreen(root, opts);
}
