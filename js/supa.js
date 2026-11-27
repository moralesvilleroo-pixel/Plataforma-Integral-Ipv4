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
    .catch((err) => {
      // Sin conexión se conserva la sesión para reintentar; si el servidor rechaza el token, se cierra.
      if (err.code === 'network') throw err;
      setSession(null);
      return null;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// ---------- Auth ----------
// Flujo PKCE: el enlace de regreso solo trae un código de un uso (?code=...), nunca los tokens.
// El código solo se puede canjear con el verificador que se guardó en este mismo dispositivo.

const PKCE_KEY = 'subnetpro:pkce';
const PKCE_TTL = 24 * 3600 * 1000;
const redirectTo = () => `${location.origin}${location.pathname}`;

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Crea y guarda un verificador para este intento; devuelve el desafío que viaja a Supabase. */
async function newChallenge(kind) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, kind, at: Date.now() })); } catch { /* sin almacenamiento el canje fallará y se avisa */ }
  return { code_challenge: b64url(digest), code_challenge_method: 's256' };
}

function takeVerifier() {
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PKCE_KEY) ?? 'null'); localStorage.removeItem(PKCE_KEY); } catch { /* nada guardado */ }
  if (!pending || typeof pending.verifier !== 'string' || Date.now() - pending.at > PKCE_TTL) return null;
  return pending;
}

export async function signUp(email, password) {
  const pkce = await newChallenge('signup');
  const data = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo())}`, {
    method: 'POST', auth: false, body: { email, password, ...pkce },
  });
  if (data?.access_token) { setSession(data); return { needsConfirmation: false }; }
  return { needsConfirmation: true };
}

export async function signIn(email, password) {
  setSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
}

export async function signOut() {
  try { await request('/auth/v1/logout?scope=global', { method: 'POST' }); } catch { /* se cierra localmente igual */ }
  setSession(null);
}

export async function signInWithGoogle() {
  if (!configured) throw new SupaError('not_configured', 'Las cuentas aún no están activadas en esta versión.', 0);
  const { code_challenge: cc, code_challenge_method: cm } = await newChallenge('oauth');
  location.assign(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo())}&code_challenge=${cc}&code_challenge_method=${cm}`);
}

export async function recoverPassword(email) {
  const pkce = await newChallenge('recovery');
  return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo())}`, { method: 'POST', auth: false, body: { email, ...pkce } });
}

export const updatePassword = (password) => request('/auth/v1/user', { method: 'PUT', body: { password } });

/** ¿La URL trae el regreso de Google o de un enlace de correo? */
export function hasAuthRedirect() {
  const q = new URLSearchParams(location.search);
  return q.has('code') || q.has('error') || /(^|[#&])(access_token|error)=/.test(location.hash);
}

/** Canjea el código del enlace por una sesión y deja la URL limpia. Devuelve el tipo de enlace o el error. */
export async function consumeAuthRedirect() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = q.get('code');
  const error = q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error');
  const hadTokens = h.has('access_token');
  // La URL se limpia siempre antes de cualquier otra cosa: el código no debe quedar en el historial.
  history.replaceState(null, '', `${location.pathname}#cuenta`);
  if (error) return { error: 'El enlace no es válido o ya venció. Pide uno nuevo.' };
  // Tokens en la URL (flujo implícito antiguo): se descartan; ya no se aceptan sesiones por ese camino.
  if (hadTokens) return { error: 'Ese enlace es de una versión anterior. Inicia sesión o pide un enlace nuevo.' };
  if (!code) return null;
  const pending = takeVerifier();
  if (!pending) {
    return { type: 'no-verifier', error: 'Abre el enlace en el mismo dispositivo y navegador donde lo pediste. Si era para activar tu cuenta, ya quedó activada: inicia sesión.' };
  }
  try {
    const s = await request('/auth/v1/token?grant_type=pkce', { method: 'POST', auth: false, body: { auth_code: code, code_verifier: pending.verifier } });
    setSession(s);
    return { type: pending.kind };
  } catch {
    return { error: 'El enlace ya se usó o venció. Pide uno nuevo.' };
  }
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
