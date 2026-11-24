// Asistente de redes: conversa con la Edge Function chat-redes.
import { h } from './lib.js';
import { configured, currentUser, callFunction, rpc } from './supa.js';

const HISTORY_KEY = 'subnetpro:chat';
const MAX_CHARS = 800;
const MAX_SENT = 12;
const SUGGESTIONS = [
  '¿Cuál es la diferencia entre un switch y un router?',
  'Divide 192.168.10.0/24 en 6 subredes y explícame los pasos',
  '¿Por qué el cableado horizontal no puede pasar de 90 metros?',
];

function loadHistory() {
  try {
    const list = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-40) : [];
  } catch { return []; }
}
function saveHistory(list) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-40))); } catch { /* sin almacenamiento: la conversación vive en memoria */ }
}

/** Convierte el texto de la IA en nodos: párrafos, listas, `código` y **negritas**. Nunca usa innerHTML. */
function inline(text) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('`') ? h('code', { text: t.slice(1, -1) }) : h('strong', { text: t.slice(2, -2) }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderRich(text) {
  const frag = [];
  let list = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const tag = num ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag); frag.push(list); }
      list.append(h('li', {}, inline((bullet ?? num)[1].replace(/^#+\s*/, ''))));
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    frag.push(heading ? h('p', {}, h('strong', {}, inline(heading[1]))) : h('p', {}, inline(line)));
  }
  return frag;
}

function bubble(m) {
  return h('li', { class: `msg msg--${m.role}` },
    h('span', { class: 'msg__who', text: m.role === 'user' ? 'Tú' : 'Asistente' }),
    h('div', { class: 'msg__body' }, m.role === 'user' ? h('p', { text: m.content }) : renderRich(m.content)));
}

function typing() {
  return h('li', { class: 'msg msg--assistant', 'aria-hidden': 'true' },
    h('span', { class: 'msg__who', text: 'Asistente' }),
    h('div', { class: 'msg__body' },
      h('div', { class: 'sk sk-line sk-w90' }), h('div', { class: 'sk sk-line sk-w70' }), h('div', { class: 'sk sk-line sk-w40' })));
}

export function renderChat(root) {
  if (!configured || !currentUser()) {
    root.replaceChildren(h('section', { class: 'panel state enter' },
      h('h1', { tabindex: '-1', text: 'Asistente de redes' }),
      h('p', { text: configured
        ? 'Resuelve dudas de cableado, dispositivos, protocolos y subneteo. Para usarlo necesitas una cuenta gratis: así evitamos abusos y cuidamos el límite diario.'
        : 'El asistente se activa cuando la app esté conectada a Supabase.' }),
      configured ? h('a', { class: 'btn btn--primary', href: '#cuenta', text: 'Crear cuenta o iniciar sesión' }) : null));
    return;
  }

  let history = loadHistory();
  let sending = false;
  const list = h('ol', { class: 'chat__list', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const quota = h('p', { class: 'eyebrow-num chat__quota' }, h('span', { class: 'sk sk-line sk-inline' }));
  const area = h('textarea', { class: 'input chat__input', id: 'chat-in', rows: 2, maxlength: MAX_CHARS, placeholder: 'Escribe tu duda de redes' });
  const count = h('span', { class: 'eyebrow-num', 'aria-live': 'off', text: `0/${MAX_CHARS}` });
  const send = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Enviar', disabled: true });
  const status = h('div', { 'aria-live': 'assertive' });

  const setQuota = (remaining, limit) => {
    quota.textContent = `Te quedan ${remaining} de ${limit} preguntas hoy.`;
  };
  rpc('chat_status').then((s) => setQuota(s.remaining, s.limit)).catch(() => { quota.textContent = ''; });

  const drawList = () => {
    if (history.length === 0) {
      list.replaceChildren(h('li', { class: 'chat__empty' },
        h('p', { text: 'Pregunta lo que no te quedó claro del módulo. Algunas ideas:' }),
        h('div', { class: 'row' }, SUGGESTIONS.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => ask(q) }, q)))));
      return;
    }
    list.replaceChildren(...history.map(bubble));
  };

  const scrollDown = () => list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  async function ask(text) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || sending) return;
    sending = true;
    status.replaceChildren();
    if (history.length === 0) list.replaceChildren();
    history.push({ role: 'user', content: q });
    saveHistory(history);
    list.append(bubble(history[history.length - 1]));
    const wait = typing();
    list.append(wait);
    list.setAttribute('aria-busy', 'true');
    area.value = '';
    count.textContent = `0/${MAX_CHARS}`;
    send.disabled = true;
    scrollDown();
    try {
      const res = await callFunction('chat-redes', { messages: history.slice(-MAX_SENT) });
      history.push({ role: 'assistant', content: res.reply });
      saveHistory(history);
      wait.replaceWith(bubble(history[history.length - 1]));
      if (Number.isFinite(res.remaining)) setQuota(res.remaining, res.limit);
    } catch (err) {
      wait.remove();
      history.pop();
      saveHistory(history);
      list.lastElementChild?.remove();
      if (history.length === 0) drawList();
      area.value = q;
      const msg = err.code === 'limit_reached'
        ? 'Llegaste al límite de preguntas de hoy. Mañana se renueva.'
        : err.code === 'not_authenticated'
          ? 'Tu sesión terminó. Inicia sesión otra vez.'
          : err.code === 'provider_busy'
            ? 'La IA está muy ocupada en este momento. Espera un minuto y vuelve a intentarlo; la pregunta no se descontó.'
          : err.code === 'network'
            ? 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
            : 'El asistente no pudo responder. Tu pregunta no se descontó; inténtalo otra vez.';
      status.replaceChildren(h('p', { class: 'notice notice--error', role: 'alert' }, msg,
        err.code !== 'limit_reached' && err.code !== 'not_authenticated'
          ? h('button', { class: 'btn btn--ghost btn--sm notice__btn', type: 'button', text: 'Reintentar', onclick: () => ask(q) })
          : null));
      if (err.code === 'limit_reached') quota.textContent = 'No te quedan preguntas hoy.';
    } finally {
      sending = false;
      list.setAttribute('aria-busy', 'false');
      send.disabled = !area.value.trim();
      scrollDown();
    }
  }

  area.addEventListener('input', () => {
    count.textContent = `${area.value.length}/${MAX_CHARS}`;
    send.disabled = sending || !area.value.trim();
  });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(area.value); }
  });
  const form = h('form', { class: 'chat__form', novalidate: true },
    h('label', { class: 'visually-hidden', for: 'chat-in', text: 'Tu pregunta' }),
    area,
    h('div', { class: 'chat__bar' }, count, send));
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(area.value); });

  const reset = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Nueva conversación',
    onclick: () => { history = []; saveHistory(history); status.replaceChildren(); drawList(); area.focus(); } });

  root.replaceChildren(h('div', { class: 'enter chat' },
    h('header', { class: 'view-head chat__head' },
      h('h1', { tabindex: '-1', text: 'Asistente de redes' }),
      h('p', { class: 'lead', text: 'Solo responde temas de redes. Es una IA: puede equivocarse, así que compara con tu módulo y tu profesor.' }),
      h('div', { class: 'row' }, quota, reset)),
    h('section', { class: 'panel chat__panel', 'aria-label': 'Conversación' }, list, status, form)));
  drawList();
  scrollDown();
}
