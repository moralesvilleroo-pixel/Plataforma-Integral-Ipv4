// Cliente mínimo de Supabase (Auth, base de datos, funciones) con fetch, sin dependencias.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_KEY = 'subnetpro:session';
const base = SUPABASE_URL.replace(/\/+$/, '');
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && SUPABASE_KEY.length > 20;

const listeners = new Set();
let session = readSession();
let refreshing = null;

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    return s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' ? s : null;
  } catch { return null; }
}

function setSession(s) {
  session = s ? {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + Number(s.expires_in ?? 3600),
    user: s.user ? {
      id: s.user.id,
      email: s.user.email,
      name: s.user.user_metadata?.full_name ?? s.user.user_metadata?.name ?? null,
      provider: s.user.app_metadata?.provider ?? 'email',
    } : session?.user ?? null,
  } : null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* almacenamiento bloqueado: la sesión dura lo que dure la pestaña */ }
  for (const fn of listeners) fn(session);
}

export const currentUser = () => session?.user ?? null;
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export class SupaError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const AUTH_MESSAGES = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo: te enviamos un enlace al registrarte.',
  user_already_exists: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  email_exists: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.',
  over_email_send_rate_limit: 'Se enviaron muchos correos. Espera unos minutos e inténtalo otra vez.',
  over_request_rate_limit: 'Demasiados intentos. Espera un momento.',
  email_address_invalid: 'Ese correo no es válido.',
  signup_disabled: 'El registro está desactivado por ahora.',
  same_password: 'La nueva contraseña debe ser distinta a la anterior.',
};

async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  if (!configured) throw new SupaError('not_configured', 'Las cuentas aún no están activadas en esta versión.', 0);
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const token = await accessToken();
    if (!token) throw new SupaError('not_authenticated', 'Tu sesión terminó. Inicia sesión de nuevo.', 401);
    h.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new SupaError('network', 'No hay conexión con el servidor. Revisa tu internet.', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const code = data?.error_code ?? data?.code ?? data?.error ?? `http_${res.status}`;
    const msg = AUTH_MESSAGES[code] ?? (typeof data?.msg === 'string' ? data.msg : null) ?? `Error del servidor (${res.status}).`;
    if (res.status === 401 && auth) setSession(null);
    throw new SupaError(String(code), msg, res.status);
  }
  return data;
}

async function accessToken() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } })
    .then((s) => { setSession(s); return s.access_token; })
    .catch(() => { setSession(null); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// ---------- Auth ----------

const redirectTo = () => `${location.origin}${location.pathname}`;

export async function signUp(email, password) {
  const data = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo())}`, {
    method: 'POST', auth: false, body: { email, password },
  });
  if (data?.access_token) { setSession(data); return { needsConfirmation: false }; }
  return { needsConfirmation: true };
}

export async function signIn(email, password) {
  setSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
}

export async function signOut() {
  try { await request('/auth/v1/logout', { method: 'POST' }); } catch { /* se cierra localmente igual */ }
  setSession(null);
}

/** Inicio con Google: Supabase hace el intercambio y devuelve los tokens en el enlace de regreso. */
export function signInWithGoogle() {
  if (!configured) throw new SupaError('not_configured', 'Las cuentas aún no están activadas en esta versión.', 0);
  location.assign(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo())}`);
}

export const recoverPassword = (email) =>
  request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo())}`, { method: 'POST', auth: false, body: { email } });

export const updatePassword = (password) => request('/auth/v1/user', { method: 'PUT', body: { password } });

/** Lee los tokens que Supabase deja en el enlace del correo. Devuelve el tipo de enlace o el error. */
export function consumeAuthRedirect() {
  const raw = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(raw)) return null;
  const p = new URLSearchParams(raw);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (p.get('error')) return { error: p.get('error_description') ?? 'El enlace no es válido o ya venció.' };
  setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
  request('/auth/v1/user').then((u) => setSession({ ...session, user: u })).catch(() => {});
  return { type: p.get('type') ?? 'signup' };
}

// ---------- Datos ----------

export const rpc = (name, args = {}) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });

export async function pullProgress() {
  const rows = await request('/rest/v1/progress?select=data,updated_at');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export const pushProgress = (data) => request('/rest/v1/progress?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: { user_id: session?.user?.id, data, updated_at: new Date().toISOString() },
});

/** Envía un comentario. Funciona con o sin sesión: sin sesión entra como usuario anónimo de la base. */
export async function sendFeedback(row) {
  const signedIn = Boolean(await accessToken());
  return request('/rest/v1/feedback', {
    method: 'POST',
    auth: signedIn,
    headers: { Prefer: 'return=minimal' },
    body: row,
  });
}

export const callFunction = (name, body) => request(`/functions/v1/${name}`, { method: 'POST', body });
