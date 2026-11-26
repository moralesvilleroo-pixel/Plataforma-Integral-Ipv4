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
  '¿Qué significa /26 y cuántos hosts deja?',
];
const SVG_NS = 'http://www.w3.org/2000/svg';
// En pantallas táctiles Enter hace salto de línea; se envía con el botón.
const coarse = window.matchMedia('(pointer: coarse)').matches;

function icon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function loadHistory() {
  try {
    const list = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-40) : [];
  } catch { return []; }
}
function saveHistory(list) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-40))); } catch { /* sin almacenamiento: la conversación vive en memoria */ }
}

/** Convierte el texto de la IA en nodos: párrafos, listas, bloques de código, `código` y **negritas**. Nunca usa innerHTML. */
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
  let fence = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) {
      if (fence) { frag.push(h('pre', {}, h('code', { text: fence.join('\n') }))); fence = null; } else { fence = []; list = null; }
      continue;
    }
    if (fence) { fence.push(raw); continue; }
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
    frag.push(heading ? h('p', { class: 'msg__h' }, inline(heading[1])) : h('p', {}, inline(line)));
  }
  if (fence) frag.push(h('pre', {}, h('code', { text: fence.join('\n') })));
  return frag;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso: se usa la vía antigua */ }
  const tmp = h('textarea', { class: 'visually-hidden', readonly: true });
  tmp.value = text;
  document.body.append(tmp);
  tmp.select();
  const ok = document.execCommand('copy');
  tmp.remove();
  return ok;
}

function copyButton(text) {
  const label = h('span', { text: 'Copiar' });
  const btn = h('button', { class: 'msg__act', type: 'button', 'aria-label': 'Copiar respuesta' }, icon('i-copy'), label);
  let timer;
  btn.addEventListener('click', async () => {
    const ok = await copyText(text);
    btn.replaceChildren(icon(ok ? 'i-check' : 'i-copy'), label);
    label.textContent = ok ? 'Copiado' : 'No se pudo copiar';
    clearTimeout(timer);
    timer = setTimeout(() => { btn.replaceChildren(icon('i-copy'), label); label.textContent = 'Copiar'; }, 1800);
  });
  return btn;
}

function bubble(m) {
  const mine = m.role === 'user';
  return h('li', { class: `msg msg--${m.role}` },
    h('span', { class: 'visually-hidden', text: mine ? 'Tú dijiste:' : 'El asistente respondió:' }),
    h('div', { class: 'msg__body' }, mine ? h('p', { text: m.content }) : renderRich(m.content)),
    mine ? null : h('div', { class: 'msg__acts' }, copyButton(m.content)));
}

function typing() {
  return h('li', { class: 'msg msg--assistant msg--typing' },
    h('div', { class: 'msg__body' },
      h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'msg__wait', text: 'Pensando la respuesta' })));
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
  const log = h('div', { class: 'chat__log', tabindex: '0', 'aria-label': 'Mensajes' });
  const list = h('ol', { class: 'chat__list', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  log.append(list);

  const meter = h('span', { class: 'quota__bar', 'aria-hidden': 'true' }, h('i'));
  const quotaText = h('span', { class: 'sk sk-line sk-inline quota__sk' });
  const quota = h('p', { class: 'chat__quota quota' }, meter, quotaText);
  const setQuota = (remaining, limit) => {
    quota.classList.toggle('quota--empty', remaining <= 0);
    meter.firstChild.style.width = `${limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) * 100 : 0}%`;
    quotaText.className = 'quota__txt';
    quotaText.replaceChildren(h('b', { text: `${remaining}/${limit}` }), h('span', { class: 'quota__long', text: ' preguntas' }), ' hoy');
    quota.setAttribute('aria-label', `Te quedan ${remaining} de ${limit} preguntas hoy`);
  };
  rpc('chat_status').then((s) => setQuota(s.remaining, s.limit)).catch(() => { quota.hidden = true; });

  const area = h('textarea', { class: 'chat__input', id: 'chat-in', rows: 1, maxlength: MAX_CHARS,
    placeholder: 'Escribe tu duda de redes', enterkeyhint: coarse ? 'enter' : 'send', 'aria-describedby': 'chat-note' });
  const count = h('span', { class: 'chat__count', 'aria-live': 'off', hidden: true });
  const send = h('button', { class: 'chat__send', type: 'submit', 'aria-label': 'Enviar pregunta', disabled: true }, icon('i-send'));
  const status = h('div', { class: 'chat__status', 'aria-live': 'assertive' });

  const grow = () => {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 168)}px`;
  };
  const refresh = () => {
    const n = area.value.length;
    count.hidden = n < MAX_CHARS - 200;
    count.textContent = `${n}/${MAX_CHARS}`;
    send.disabled = sending || !area.value.trim();
    grow();
  };

  const drawList = () => {
    if (history.length === 0) {
      list.replaceChildren(h('li', { class: 'chat__empty' },
        h('p', { class: 'chat__empty-t', text: '¿Qué quieres repasar?' }),
        h('p', { class: 'muted', text: 'Pregunta lo que no te quedó claro del módulo, o empieza con una de estas:' }),
        h('div', { class: 'chat__sugs' }, SUGGESTIONS.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => ask(q) }, q)))));
      return;
    }
    list.replaceChildren(...history.map(bubble));
  };

  const toBottom = (smooth = true) => log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  // Una respuesta larga se muestra desde su inicio, no desde el final.
  const toMessage = (el) => {
    const top = el.offsetTop - list.offsetTop - 8;
    log.scrollTo({ top: Math.min(top, log.scrollHeight), behavior: 'smooth' });
  };

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
    form.classList.add('is-busy');
    area.value = '';
    area.placeholder = 'El asistente está respondiendo';
    refresh();
    toBottom();
    try {
      const res = await callFunction('chat-redes', { messages: history.slice(-MAX_SENT) });
      history.push({ role: 'assistant', content: res.reply });
      saveHistory(history);
      const answer = bubble(history[history.length - 1]);
      wait.replaceWith(answer);
      if (Number.isFinite(res.remaining)) setQuota(res.remaining, res.limit);
      requestAnimationFrame(() => toMessage(answer));
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
      if (err.code === 'limit_reached') {
        quota.hidden = false;
        quota.classList.add('quota--empty');
        meter.firstChild.style.width = '0%';
        quotaText.className = 'quota__txt';
        quotaText.textContent = 'Sin preguntas hoy';
      }
      requestAnimationFrame(() => toBottom());
    } finally {
      sending = false;
      list.setAttribute('aria-busy', 'false');
      form.classList.remove('is-busy');
      area.placeholder = 'Escribe tu duda de redes';
      refresh();
    }
  }

  area.addEventListener('input', refresh);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse) { e.preventDefault(); ask(area.value); }
  });
  const form = h('form', { class: 'chat__form', novalidate: true },
    h('label', { class: 'visually-hidden', for: 'chat-in', text: 'Tu pregunta' }),
    h('div', { class: 'composer' }, area, h('div', { class: 'composer__side' }, count, send)));
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(area.value); });

  const reset = h('button', { class: 'chat__new', type: 'button', title: 'Nueva conversación',
    onclick: () => { history = []; saveHistory(history); status.replaceChildren(); drawList(); area.focus(); } },
  icon('i-new'), h('span', { class: 'chat__new-l', text: 'Nueva conversación' }));

  // Los botones junto al campo no le quitan el foco: el teclado sigue abierto y la barra de pestañas no salta bajo el dedo.
  const dock = h('div', { class: 'chat__dock' }, status, form,
    h('p', { class: 'chat__note', id: 'chat-note', text: coarse
      ? 'Solo temas de redes. Es una IA y puede equivocarse: compara con tu módulo.'
      : 'Solo temas de redes. Es una IA y puede equivocarse: compara con tu módulo. Enter envía, Shift + Enter hace salto de línea.' }));
  dock.addEventListener('pointerdown', (e) => { if (e.target.closest('button') && document.activeElement === area) e.preventDefault(); });

  root.replaceChildren(h('div', { class: 'enter chat' },
    h('header', { class: 'chat__head' },
      h('h1', { tabindex: '-1', text: 'Asistente de redes' }),
      h('div', { class: 'chat__tools' }, quota, reset)),
    h('section', { class: 'chat__panel', 'aria-label': 'Conversación' },
      log,
      dock)));
  drawList();
  refresh();
  requestAnimationFrame(() => toBottom(false));
}
