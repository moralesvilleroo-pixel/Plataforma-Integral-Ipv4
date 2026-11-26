// Enrutador por hash y vistas de inicio, aprendizaje y repaso.
import { h, shuffle, loadState, saveState, clearState, markStudyDay, gradeCard, dueIds, nextDueDay, dayNum } from './lib.js';
import { runQuiz } from './quiz.js';
import { renderPractice } from './practice.js';
import { renderCalculator } from './calculator.js';
import { renderAccount, renderNewPassword } from './account.js';
import { renderChat } from './chat.js';
import { renderBits } from './bits.js';
import { renderDrill, renderExam, renderBlocked, examActive } from './drills.js';
import { configured, currentUser, onAuthChange, consumeAuthRedirect } from './supa.js';
import { syncNow, schedulePush } from './sync.js';

const MASTERY = 80;
const QUIZ_SIZE = 8;
const REVIEW_SIZE = 20;

const app = document.getElementById('app');
let state = loadState();
let data = null;      // { unidades, byId, questions: Map }
let loading = null;   // promesa de carga en curso
let loadError = null;

const save = () => { saveState(state); updateDueBadge(); schedulePush(() => state); };
const applyMerged = (merged) => { state = loadStateFrom(merged); saveState(state); updateDueBadge(); };

/** Valida un progreso que viene del servidor pasándolo por el mismo filtro que el local. */
function loadStateFrom(obj) {
  saveState(obj);
  return loadState();
}

// ---------- Datos ----------

function validate(json) {
  if (!json || !Array.isArray(json.unidades)) throw new Error('Formato de contenido no reconocido.');
  const questions = new Map();
  const unidades = json.unidades.filter((u) => u && typeof u.id === 'string' && Array.isArray(u.preguntas)).map((u) => {
    const preguntas = u.preguntas.filter((q) => {
      if (!q || typeof q.id !== 'string' || typeof q.q !== 'string') return false;
      if (q.tipo === 'orden') return Array.isArray(q.items) && q.items.length > 1;
      return Array.isArray(q.o) && q.o.filter((o) => o.ok === true).length === 1;
    });
    for (const q of preguntas) questions.set(q.id, { ...q, unidad: u.id });
    return { ...u, preguntas };
  });
  return { unidades, byId: new Map(unidades.map((u) => [u.id, u])), questions };
}

function ensureData() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loadError = null;
    loading = fetch('data/unidades.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`); return r.json(); })
      .then((json) => { data = validate(json); updateDueBadge(); return data; })
      .catch((err) => { loadError = err; throw err; })
      .finally(() => { loading = null; });
  }
  return loading;
}

const validIds = () => new Set(data ? data.questions.keys() : []);

function updateDueBadge() {
  const badge = document.querySelector('[data-due]');
  if (!badge || !data) return;
  updateRailProgress();
  const n = dueIds(state, validIds()).length;
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.setAttribute('aria-label', `${n} pendientes`);
}

// ---------- Estados de carga y error ----------

function skeleton(kind) {
  const lines = (n) => Array.from({ length: n }, (_, i) => {
    const s = h('div', { class: 'sk sk-line' });
    s.style.width = `${90 - i * 12}%`;
    return s;
  });
  return h('div', { 'aria-hidden': 'true' },
    h('div', { class: 'sk sk-title' }),
    lines(kind === 'unit' ? 5 : 2),
    h('div', { class: 'sk-grid' }, Array.from({ length: kind === 'unit' ? 2 : 4 }, () => h('div', { class: 'sk sk-card' }))));
}

function errorState(retry) {
  return h('section', { class: 'panel state enter', role: 'alert' },
    h('h1', { tabindex: '-1', text: 'No se pudo cargar el contenido' }),
    h('p', { text: `Revisa tu conexión e inténtalo otra vez. Detalle: ${loadError?.message ?? 'error desconocido'}` }),
    h('button', { class: 'btn btn--primary', type: 'button', text: 'Reintentar', onclick: retry }));
}

/** Muestra el esqueleto mientras llegan los datos y luego pinta la vista. */
function withData(kind, render) {
  if (data) { render(); return; }
  app.setAttribute('aria-busy', 'true');
  app.replaceChildren(h('p', { class: 'visually-hidden', text: 'Cargando contenido' }), skeleton(kind));
  ensureData()
    .then(() => { if (currentKind === kind) render(); })
    .catch(() => {
      app.setAttribute('aria-busy', 'false');
      app.replaceChildren(errorState(() => withData(kind, render)));
      app.querySelector('h1').focus();
    });
}

// ---------- Vistas ----------

function unitStatus(u) {
  const st = state.units[u.id];
  if (st?.mastered) return h('span', { class: 'tag tag--ok', text: 'Dominada' });
  if (st?.attempts) return h('span', { class: 'tag', text: `Mejor: ${st.best} %` });
  return h('span', { class: 'tag', text: 'Sin empezar' });
}

function viewHome() {
  const ids = validIds();
  const due = dueIds(state, ids).length;
  const total = data.unidades.length;
  const mastered = data.unidades.filter((u) => state.units[u.id]?.mastered).length;
  const next = data.unidades.find((u) => !state.units[u.id]?.mastered);
  const cards = Object.keys(state.cards).filter((id) => ids.has(id)).length;
  const nd = nextDueDay(state, ids);

  const bar = h('span');
  bar.style.width = `${Math.round((mastered / total) * 100)}%`;

  let todayText;
  let todayCta;
  if (due > 0) {
    todayText = 'Preguntas que ya estudiaste y conviene recordar hoy, antes de que se olviden.';
    todayCta = h('a', { class: 'btn btn--primary', href: '#repasar', text: `Repasar ${due} ${due === 1 ? 'pregunta' : 'preguntas'}` });
  } else if (cards === 0) {
    todayText = 'Aún no tienes preguntas en repaso. Cada pregunta que respondas en una unidad entra a tu mazo.';
    todayCta = h('a', { class: 'btn btn--primary', href: `#unidad/${next?.id ?? data.unidades[0].id}`, text: 'Empezar la unidad 1' });
  } else {
    const days = nd - dayNum();
    todayText = `Estás al día. El próximo repaso llega ${days <= 1 ? 'mañana' : `en ${days} días`}.`;
    todayCta = next ? h('a', { class: 'btn btn--primary', href: `#unidad/${next.id}`, text: `Seguir con ${next.titulo}` }) : null;
  }

  app.replaceChildren(h('div', { class: 'enter' },
    h('header', { class: 'view-head' },
      h('h1', { tabindex: '-1', text: 'Principios de redes y subneteo para tu módulo técnico' }),
      h('p', { class: 'lead', text: `${total} unidades basadas en el módulo de Montaje de Redes, con preguntas que se repiten justo cuando las vas a olvidar.` })),
    h('div', { class: 'home' },
      h('div', {},
        h('section', { class: 'panel today', 'aria-labelledby': 'today-h' },
          h('h2', { id: 'today-h', text: 'Repaso de hoy' }),
          h('p', { class: 'today__num' }, String(due), h('small', { text: due === 1 ? 'pendiente' : 'pendientes' })),
          h('p', { text: todayText }),
          h('div', { class: 'row' }, todayCta, h('a', { class: 'btn btn--ghost', href: '#practica', text: 'Practicar subneteo' })),
          h('div', { class: 'quick' },
            h('a', { class: 'quick__item', href: '#reto' }, h('b', { text: 'Reto de 60 s' }), h('span', { text: 'Máscaras, binario y saltos contra el reloj' })),
            h('a', { class: 'quick__item', href: '#examen' }, h('b', { text: 'Examen sin ayudas' }), h('span', { text: '10 ejercicios en 10 minutos, sin calculadora' })),
            h('a', { class: 'quick__item', href: '#bits' }, h('b', { text: 'Laboratorio de bits' }), h('span', { text: 'Red, subred y host, bit a bit' })))),
        h('section', { class: 'panel plan', 'aria-labelledby': 'plan-h' },
          h('h2', { id: 'plan-h', text: 'Planes' }),
          h('dl', {},
            h('dt', { text: 'Gratis' }), h('dd', { text: 'Todas las unidades, repaso, práctica y calculadora. En esta prueba no hay anuncios.' }),
            h('dt', {}, 'Premium', h('span', { class: 'tag', text: 'Próximamente' })),
            h('dd', { text: 'Sin anuncios, simulacros tipo examen y estadísticas por tema.' })))),
      h('section', { class: 'panel', 'aria-labelledby': 'prog-h' },
        h('h2', { id: 'prog-h', text: 'Tu avance' }),
        h('div', { class: 'stats' },
          h('div', {},
            h('div', { class: 'stat' }, h('span', { text: 'Unidades dominadas' }), h('b', { text: `${mastered}/${total}` })),
            h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Unidades dominadas', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': mastered }, bar)),
          h('div', { class: 'stat' }, h('span', { text: 'Preguntas en tu mazo' }), h('b', { text: cards })),
          h('div', { class: 'stat' }, h('span', { text: 'Nivel de subneteo' }), h('b', { text: `${state.practice.level}/4` })),
          h('div', { class: 'stat' }, h('span', { text: 'Mejor reto de 60 s' }), h('b', { text: state.drills.best })),
          h('div', { class: 'stat' }, h('span', { text: 'Días estudiados' }), h('b', { text: state.days.length }))),
        h('h3', { class: 'unitbars__h', text: 'Por unidad' }),
        h('ul', { class: 'unitbars' }, data.unidades.map((u, i) => {
          const st = state.units[u.id];
          const pct = st?.best ?? 0;
          const fill = h('span');
          fill.style.width = `${pct}%`;
          return h('li', {},
            h('a', { class: 'unitbar', href: `#unidad/${u.id}` },
              h('span', { class: 'unitbar__name' }, h('span', { class: 'unitbar__n mono', text: String(i + 1).padStart(2, '0') }), u.titulo),
              h('span', { class: 'unitbar__pct mono', text: st?.mastered ? 'Dominada' : st?.attempts ? `${pct} %` : 'Sin empezar' }),
              h('span', { class: `bar unitbar__bar${st?.mastered ? ' unitbar__bar--done' : ''}`, role: 'progressbar', 'aria-label': `Mejor resultado en ${u.titulo}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, fill)));
        }))),
    )));
}

function viewLearn() {
  app.replaceChildren(h('div', { class: 'enter' },
    h('header', { class: 'view-head' },
      h('h1', { tabindex: '-1', text: 'Unidades del módulo' }),
      h('p', { class: 'lead', text: `Lee los puntos clave y presenta la prueba de dominio: necesitas ${MASTERY} % para darla por dominada.` })),
    h('ol', { class: 'units' }, data.unidades.map((u, i) => h('li', {},
      h('a', { class: 'unit', href: `#unidad/${u.id}` },
        h('span', { class: 'unit__n', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
        h('span', {},
          h('h3', { text: u.titulo }),
          h('p', { text: u.resumen }),
          h('span', { class: 'unit__meta' },
            h('span', { class: 'tag', text: u.capa }),
            h('span', { class: 'tag', text: `${u.preguntas.length} preguntas` }),
            unitStatus(u)))))))));
}

function viewUnit(id) {
  const u = data.byId.get(id);
  if (!u) { viewNotFound(); return; }
  const idx = data.unidades.indexOf(u);
  const st = state.units[u.id];
  const size = Math.min(QUIZ_SIZE, u.preguntas.length);

  app.replaceChildren(h('div', { class: 'enter' },
    h('a', { class: 'back', href: '#aprender', text: '‹ Todas las unidades' }),
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow-num', text: `Unidad ${idx + 1} · ${u.capa}` }),
      h('h1', { tabindex: '-1', text: u.titulo }),
      h('p', { class: 'lead', text: u.resumen })),
    h('div', { class: 'lesson' },
      h('section', { class: 'panel', 'aria-labelledby': 'pk-h' },
        h('h2', { id: 'pk-h', text: 'Puntos clave' }),
        h('ol', { class: 'points' }, u.puntos.map((p) => h('li', { text: p })))),
      h('aside', { class: 'panel aside-actions', 'aria-labelledby': 'pd-h' },
        h('h2', { id: 'pd-h', text: 'Prueba de dominio' }),
        h('p', { text: `${size} preguntas al azar de ${u.preguntas.length}. Necesitas ${MASTERY} % o más.` }),
        h('p', {}, 'Estado: ', unitStatus(u)),
        h('a', { class: 'btn btn--primary', href: `#unidad/${u.id}/prueba`, text: st?.attempts ? 'Repetir la prueba' : 'Presentar la prueba' })))));
}

function viewUnitQuiz(id) {
  const u = data.byId.get(id);
  if (!u) { viewNotFound(); return; }
  const qs = shuffle(u.preguntas).slice(0, QUIZ_SIZE);
  const holder = h('div');
  app.replaceChildren(h('div', {},
    h('a', { class: 'back', href: `#unidad/${u.id}`, text: `‹ ${u.titulo}` }),
    holder));

  runQuiz(holder, {
    questions: qs,
    onAnswer: (q, ok) => { gradeCard(state, q.id, ok); markStudyDay(state); save(); },
    onDone: ({ ok, total }) => {
      const pct = Math.round((ok / total) * 100);
      const prev = state.units[u.id] ?? { best: 0, attempts: 0, mastered: false };
      const passed = pct >= MASTERY;
      state.units[u.id] = { best: Math.max(prev.best, pct), attempts: prev.attempts + 1, mastered: prev.mastered || passed };
      save();
      const next = data.unidades[data.unidades.indexOf(u) + 1];
      holder.replaceChildren(h('section', { class: 'panel result enter', 'aria-labelledby': 'res-h' },
        h('h2', { id: 'res-h', tabindex: '-1', text: passed ? 'Unidad dominada' : 'Todavía no alcanzas el 80 %' }),
        h('p', { class: 'result__score', text: `${pct} %` }),
        h('p', { text: `${ok} de ${total} correctas. ${passed
          ? 'Estas preguntas vuelven a tu repaso en los próximos días para que no se olviden.'
          : 'Las que fallaste vuelven mañana en tu repaso. Relee los puntos clave y vuelve a intentarlo: saldrán otras preguntas.'}` }),
        passed && configured && !currentUser() && !state.flags.syncNudge ? syncNudge() : null,
        h('div', { class: 'row' },
          passed && next
            ? h('a', { class: 'btn btn--primary', href: `#unidad/${next.id}`, text: `Ir a ${next.titulo}` })
            : h('a', { class: 'btn btn--primary', href: `#unidad/${u.id}`, text: 'Releer los puntos clave' }),
          h('a', { class: 'btn btn--ghost', href: '#aprender', text: 'Ver todas las unidades' }))));
      holder.querySelector('h2').focus();
    },
  });
}

/** Aviso discreto, una sola vez, para no perder el avance si se borran los datos del navegador. */
function syncNudge() {
  const box = h('div', { class: 'notice notice--ok nudge' },
    h('p', { text: 'Tu avance está solo en este dispositivo. Crea una cuenta gratis para no perderlo si borras los datos o cambias de celular.' }),
    h('div', { class: 'row' },
      h('a', { class: 'btn btn--primary btn--sm', href: '#cuenta/crear', text: 'Crear cuenta' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Ahora no', onclick: () => { state.flags.syncNudge = true; save(); box.remove(); } })));
  return box;
}

function viewReview() {
  const ids = dueIds(state, validIds());
  if (ids.length === 0) {
    const any = Object.keys(state.cards).some((id) => data.questions.has(id));
    app.replaceChildren(h('section', { class: 'panel state enter' },
      h('h1', { tabindex: '-1', text: any ? 'No tienes repasos pendientes' : 'Tu mazo de repaso está vacío' }),
      h('p', { text: any
        ? 'Respondiste todo lo que tocaba hoy. Repasar antes de tiempo ayuda poco: vuelve cuando aparezca el contador.'
        : 'Las preguntas entran al mazo cuando presentas la prueba de una unidad. Las que aciertes vuelven en unos días; las que falles, mañana.' }),
      h('a', { class: 'btn btn--primary', href: '#aprender', text: any ? 'Estudiar otra unidad' : 'Elegir una unidad' })));
    return;
  }
  // Primero lo que más se falla (y lo que está en las cajas bajas); el resto, mezclado.
  const priority = (id) => {
    const c = state.cards[id];
    const fails = c.log.filter(([, ok]) => ok === 0).length;
    return fails * 2 + (5 - c.box) + Math.random();
  };
  const qs = ids.sort((a, b) => priority(b) - priority(a)).slice(0, REVIEW_SIZE).map((id) => data.questions.get(id));
  const holder = h('div');
  app.replaceChildren(h('div', {},
    h('header', { class: 'view-head' },
      h('h1', { class: 'visually-hidden', text: 'Repaso del día' })),
    holder));
  runQuiz(holder, {
    questions: qs,
    label: (q) => data.byId.get(q.unidad)?.titulo ?? '',
    onAnswer: (q, ok) => { gradeCard(state, q.id, ok); markStudyDay(state); save(); },
    onDone: ({ ok, total }) => {
      const left = dueIds(state, validIds()).length;
      holder.replaceChildren(h('section', { class: 'panel result enter', 'aria-labelledby': 'rv-h' },
        h('h2', { id: 'rv-h', tabindex: '-1', text: 'Repaso terminado' }),
        h('p', { class: 'result__score', text: `${ok}/${total}` }),
        h('p', { text: left > 0 ? `Quedan ${left} por repasar hoy.` : 'Terminaste el repaso de hoy. Las falladas vuelven mañana.' }),
        h('div', { class: 'row' },
          left > 0 ? h('button', { class: 'btn btn--primary', type: 'button', text: 'Seguir repasando', onclick: () => viewReview() }) : null,
          h('a', { class: left > 0 ? 'btn btn--ghost' : 'btn btn--primary', href: '#inicio', text: 'Volver al inicio' }))));
      holder.querySelector('h2').focus();
    },
  });
}

function viewNotFound() {
  app.replaceChildren(h('section', { class: 'panel state enter' },
    h('h1', { tabindex: '-1', text: 'Esta sección no existe' }),
    h('p', { text: 'El enlace puede estar mal escrito.' }),
    h('a', { class: 'btn btn--primary', href: '#inicio', text: 'Ir al inicio' })));
}

// ---------- Enrutador ----------

let currentKind = '';

function route() {
  handleAuthRedirect();
  const parts = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  const [name, id, sub] = parts;
  const navKey = name === 'unidad' ? 'aprender' : ['bits', 'reto', 'examen'].includes(name) ? 'practica' : name;
  updateAccountLink();
  for (const a of document.querySelectorAll('[data-nav]')) {
    const isDesktopRail = matchMedia('(min-width: 761px)').matches;
    const key = name === 'bits' && isDesktopRail ? 'bits' : navKey;
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  currentKind = `${name}/${id ?? ''}/${sub ?? ''}`;
  const kind = currentKind;
  const done = () => { app.setAttribute('aria-busy', 'false'); app.querySelector('h1[tabindex], h2[tabindex]')?.focus(); };

  switch (name) {
    case 'inicio': withData(kind, () => { viewHome(); done(); }); break;
    case 'aprender': withData(kind, () => { viewLearn(); done(); }); break;
    case 'unidad': withData(kind, () => { if (sub === 'prueba') viewUnitQuiz(id); else viewUnit(id); done(); }); break;
    case 'repasar': withData(kind, () => { viewReview(); done(); }); break;
    case 'practica': renderPractice(app, state, save); app.setAttribute('aria-busy', 'false'); break;
    case 'calculadora': if (examActive()) renderBlocked(app, 'Calculadora bloqueada'); else renderCalculator(app); app.setAttribute('aria-busy', 'false'); break;
    case 'asistente': if (examActive()) renderBlocked(app, 'Asistente bloqueado'); else renderChat(app); done(); break;
    case 'reto': renderDrill(app, state, save); app.setAttribute('aria-busy', 'false'); break;
    case 'examen': renderExam(app, state, save); app.setAttribute('aria-busy', 'false'); break;
    case 'bits': renderBits(app, state, save); app.setAttribute('aria-busy', 'false'); break;
    case 'cuenta':
      if (id === 'nueva-clave') renderNewPassword(app);
      else renderAccount(app, {
        mode: id === 'crear' ? 'crear' : 'entrar',
        message: authMessage,
        onSyncNow: () => syncNow(state, applyMerged),
        onDeleted: () => { authMessage = { kind: 'ok', text: 'Tu cuenta fue borrada.' }; route(); },
        canInstall: () => Boolean(installPrompt),
        onInstall: async () => { installPrompt?.prompt(); await installPrompt?.userChoice; installPrompt = null; },
      });
      authMessage = null;
      done();
      break;
    default: viewNotFound(); done();
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

const dialog = document.getElementById('confirm');
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'ok') return;
  clearState();
  state = loadState();
  updateDueBadge();
  route();
});

let authMessage = null;

function updateAccountLink() {
  const user = currentUser();
  const label = user?.name ?? user?.email ?? '';
  const initial = user ? label.trim().charAt(0).toUpperCase() || '?' : '?';
  const onAccount = location.hash.startsWith('#cuenta');
  for (const id of ['account-link', 'account-link-m']) {
    const link = document.getElementById(id);
    if (!link) continue;
    if (onAccount) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  for (const id of ['account-avatar', 'account-avatar-m']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (user) { el.textContent = initial; continue; }
    // Sin sesión: silueta de persona en vez de una letra.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-user');
    svg.append(use);
    el.replaceChildren(svg);
  }
  const name = document.getElementById('account-name');
  const sub = document.getElementById('account-sub');
  if (name) name.textContent = user ? (user.name ?? 'Mi cuenta') : 'Entrar';
  if (sub) sub.textContent = user ? (user.email ?? '') : 'Guarda tu progreso';
  document.getElementById('account-link-m')?.setAttribute('aria-label', user ? 'Mi cuenta' : 'Entrar o crear cuenta');
}

function updateRailProgress() {
  const box = document.getElementById('rail-progress');
  if (!box || !data) return;
  const total = data.unidades.length;
  const done = data.unidades.filter((u) => state.units[u.id]?.mastered).length;
  box.hidden = false;
  document.getElementById('rail-progress-num').textContent = `${done}/${total}`;
  box.querySelector('.ring').style.setProperty('--p', String(Math.round((done / total) * 100)));
}

// ---------- Barra lateral contraíble ----------

const RAIL_KEY = 'subnetpro:rail';
const shell = document.getElementById('shell');
const railToggle = document.getElementById('rail-toggle');
function setRail(collapsed, remember) {
  shell.classList.toggle('is-collapsed', collapsed);
  railToggle.setAttribute('aria-expanded', String(!collapsed));
  railToggle.setAttribute('aria-label', collapsed ? 'Expandir menú' : 'Contraer menú');
  if (remember) { try { localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0'); } catch { /* sin almacenamiento */ } }
}
let savedRail = null;
try { savedRail = localStorage.getItem(RAIL_KEY); } catch { savedRail = null; }
setRail(savedRail === null ? matchMedia('(max-width: 1024px)').matches : savedRail === '1', false);
railToggle.addEventListener('click', () => setRail(!shell.classList.contains('is-collapsed'), true));

// ---------- Instalación como app (PWA) ----------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin service worker la app funciona igual, solo que no offline */ });
}

/** Procesa el enlace del correo (confirmación o recuperación) y deja la URL limpia. */
function handleAuthRedirect() {
  const redirect = configured ? consumeAuthRedirect() : null;
  if (!redirect) return;
  if (redirect.error) {
    authMessage = { kind: 'error', text: redirect.error };
    history.replaceState(null, '', '#cuenta');
  } else if (redirect.type === 'recovery') {
    history.replaceState(null, '', '#cuenta/nueva-clave');
  } else {
    authMessage = { kind: 'ok', text: 'Cuenta activada. Ya puedes usar el asistente y tu progreso se guarda en la nube.' };
    history.replaceState(null, '', '#cuenta');
  }
}

let wasLoggedIn = Boolean(currentUser());
onAuthChange(() => {
  const now = Boolean(currentUser());
  if (now && !wasLoggedIn) syncNow(state, applyMerged);
  if (now !== wasLoggedIn && /^#(cuenta|asistente)/.test(location.hash)) route();
  wasLoggedIn = now;
  updateAccountLink();
});

route();
ensureData().catch(() => { /* el error se muestra en la vista que lo necesita */ });
if (currentUser()) syncNow(state, applyMerged);
