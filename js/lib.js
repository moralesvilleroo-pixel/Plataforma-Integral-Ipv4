// Utilidades compartidas: DOM seguro, almacenamiento local y repaso espaciado (Leitner).

/** Crea elementos sin innerHTML: todo texto entra como nodo de texto. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---------- Progreso en localStorage ----------

const KEY = 'subnetpro:v1';

const fresh = () => ({ units: {}, cards: {}, practice: { level: 1, streak: 0 }, days: [] });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Lee el progreso; si falta o está corrupto, empieza de cero en vez de romper la app. */
export function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { raw = null; }
  const s = fresh();
  if (!isObj(raw)) return s;
  if (isObj(raw.units)) {
    for (const [id, u] of Object.entries(raw.units)) {
      if (isObj(u)) s.units[id] = { best: clampPct(u.best), attempts: toInt(u.attempts), mastered: u.mastered === true };
    }
  }
  if (isObj(raw.cards)) {
    for (const [id, c] of Object.entries(raw.cards)) {
      if (isObj(c)) {
        s.cards[id] = {
          box: Math.min(5, Math.max(1, toInt(c.box) || 1)),
          due: toInt(c.due),
          log: Array.isArray(c.log) ? c.log.slice(-50) : [],
        };
      }
    }
  }
  if (isObj(raw.practice)) {
    s.practice.level = Math.min(4, Math.max(1, toInt(raw.practice.level) || 1));
    s.practice.streak = toInt(raw.practice.streak);
  }
  if (Array.isArray(raw.days)) s.days = raw.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-400);
  return s;
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* almacenamiento bloqueado: no hay nada que borrar */ }
}

function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
function clampPct(v) { return Math.min(100, toInt(v)); }

// ---------- Fechas locales ----------

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Día local como número entero, para comparar vencimientos sin líos de zona horaria. */
export function dayNum(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function markStudyDay(state) {
  const t = todayStr();
  if (state.days[state.days.length - 1] !== t) state.days.push(t);
}

// ---------- Repaso espaciado (Leitner) ----------
// Se guarda el historial de cada respuesta para poder migrar a FSRS sin perder datos.

const INTERVALS = [0, 1, 2, 4, 8, 16];

export function gradeCard(state, id, ok) {
  const prev = state.cards[id];
  const box = prev ? (ok ? Math.min(5, prev.box + 1) : 1) : (ok ? 2 : 1);
  const log = prev ? prev.log : [];
  log.push([Date.now(), ok ? 1 : 0]);
  state.cards[id] = { box, due: dayNum() + INTERVALS[box], log: log.slice(-50) };
}

export function dueIds(state, validIds) {
  const now = dayNum();
  return Object.entries(state.cards)
    .filter(([id, c]) => validIds.has(id) && c.due <= now)
    .map(([id]) => id);
}

export function nextDueDay(state, validIds) {
  let min = Infinity;
  for (const [id, c] of Object.entries(state.cards)) if (validIds.has(id)) min = Math.min(min, c.due);
  return Number.isFinite(min) ? min : null;
}
