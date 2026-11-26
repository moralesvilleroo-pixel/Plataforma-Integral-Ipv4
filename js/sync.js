// Sincroniza el progreso local con Supabase. El navegador sigue siendo la fuente principal:
// se puede estudiar sin internet y al volver se suben los cambios.
import { configured, currentUser, pullProgress, pushProgress } from './supa.js';

const listeners = new Set();
export const syncStatus = { state: 'idle', at: null, message: '' };
let timer = null;

function emit(state, message = '') {
  syncStatus.state = state;
  syncStatus.message = message;
  if (state === 'ok') syncStatus.at = new Date();
  for (const fn of listeners) fn(syncStatus);
}
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const lastTs = (card) => (card?.log?.length ? card.log[card.log.length - 1][0] : 0);

/** Une dos progresos sin perder nada: lo mejor de cada unidad y la tarjeta respondida más reciente. */
export function mergeProgress(a, b) {
  const out = { units: {}, cards: {}, practice: { level: 1, streak: 0 }, days: [] };
  for (const id of new Set([...Object.keys(a.units ?? {}), ...Object.keys(b.units ?? {})])) {
    const x = a.units?.[id] ?? {};
    const y = b.units?.[id] ?? {};
    out.units[id] = {
      best: Math.max(x.best ?? 0, y.best ?? 0),
      attempts: Math.max(x.attempts ?? 0, y.attempts ?? 0),
      mastered: Boolean(x.mastered || y.mastered),
    };
  }
  for (const id of new Set([...Object.keys(a.cards ?? {}), ...Object.keys(b.cards ?? {})])) {
    const x = a.cards?.[id];
    const y = b.cards?.[id];
    out.cards[id] = !x ? y : !y ? x : (lastTs(y) > lastTs(x) ? y : x);
  }
  const pa = a.practice ?? {};
  const pb = b.practice ?? {};
  out.practice = (pb.level ?? 1) > (pa.level ?? 1) ? { level: pb.level, streak: pb.streak ?? 0 } : { level: pa.level ?? 1, streak: pa.streak ?? 0 };
  out.days = [...new Set([...(a.days ?? []), ...(b.days ?? [])])].sort().slice(-400);
  const da = a.drills ?? {};
  const db = b.drills ?? {};
  out.drills = { best: Math.max(da.best ?? 0, db.best ?? 0), examBest: Math.max(da.examBest ?? 0, db.examBest ?? 0), types: {} };
  for (const t of new Set([...Object.keys(da.types ?? {}), ...Object.keys(db.types ?? {})])) {
    const x = da.types?.[t] ?? { ok: 0, fail: 0 };
    const y = db.types?.[t] ?? { ok: 0, fail: 0 };
    out.drills.types[t] = { ok: Math.max(x.ok, y.ok), fail: Math.max(x.fail, y.fail) };
  }
  out.flags = { ...(b.flags ?? {}), ...(a.flags ?? {}) };
  return out;
}

/** Al iniciar sesión: trae lo del servidor, lo une con lo local y sube el resultado. */
export async function syncNow(state, apply) {
  if (!configured || !currentUser()) return;
  emit('syncing');
  try {
    const remote = await pullProgress();
    const merged = remote?.data ? mergeProgress(state, remote.data) : state;
    apply(merged);
    await pushProgress(merged);
    emit('ok');
  } catch (err) {
    emit('error', err.message);
  }
}

/** Tras cada cambio local: sube con un pequeño retraso para agrupar varias respuestas en un solo envío. */
export function schedulePush(getState) {
  if (!configured || !currentUser()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    emit('syncing');
    try { await pushProgress(getState()); emit('ok'); } catch (err) { emit('error', err.message); }
  }, 2500);
}
