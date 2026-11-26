// Teoría interactiva: secciones de lectura con actividades intercaladas y simuladores pequeños.
import { h, shuffle } from './lib.js';

const KEY = 'subnetpro:teoria';
const SVG_NS = 'http://www.w3.org/2000/svg';

function loadDone() {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveDone(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* sin almacenamiento: el avance dura la sesión */ }
}

/** **negrita** y `código` dentro de un texto, sin innerHTML. */
function rich(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('`') ? h('code', { text: t.slice(1, -1) }) : h('strong', { text: t.slice(2, -2) }));
    last = m.index + t.length;
  }
  out.push(text.slice(last));
  return out;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Caja común de una actividad: etiqueta, enunciado y zona de retroalimentación. */
function activity(kind, q, body, done) {
  const fb = h('div', { class: 'th-fb', 'aria-live': 'polite' });
  const box = h('div', { class: `th-act${done ? ' is-done' : ''}` },
    h('p', { class: 'th-act__kind' }, h('span', { class: 'th-act__dot', 'aria-hidden': 'true' }), kind),
    q ? h('p', { class: 'th-act__q' }, rich(q)) : null,
    body, fb);
  const say = (ok, text) => {
    fb.replaceChildren(h('p', { class: `th-fb__msg ${ok ? 'th-fb__msg--ok' : 'th-fb__msg--bad'}` },
      h('strong', { text: ok ? 'Correcto. ' : 'Todavía no. ' }), rich(text ?? '')));
  };
  return { box, fb, say, complete: () => box.classList.add('is-done') };
}

// ---------- Actividades de texto ----------

function blockQuestion(b, mark, done) {
  const opts = h('div', { class: 'th-opts' });
  const a = activity('Comprueba', b.q, opts, done);
  const order = b.fijo ? b.o : shuffle(b.o);
  opts.append(...order.map((o) => h('button', { class: 'th-opt', type: 'button', onclick: (e) => {
    for (const x of opts.children) x.classList.remove('th-opt--ok', 'th-opt--bad');
    e.currentTarget.classList.add(o.ok ? 'th-opt--ok' : 'th-opt--bad');
    a.say(Boolean(o.ok), o.fb);
    if (o.ok) { a.complete(); mark(); }
  } }, rich(o.x))));
  return a.box;
}

function blockReveal(b, mark, done) {
  const ans = h('div', { class: 'th-reveal__a', hidden: true }, rich(b.a));
  const btn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-expanded': 'false', text: 'Ver la respuesta' });
  const a = activity('Piensa antes de seguir', b.q, h('div', { class: 'th-reveal' }, btn, ans), done);
  btn.addEventListener('click', () => {
    ans.hidden = false; btn.hidden = true; btn.setAttribute('aria-expanded', 'true');
    a.complete(); mark();
  });
  return a.box;
}

function blockOrder(b, mark, done) {
  const pool = h('div', { class: 'th-pool' });
  const pick = h('ol', { class: 'th-pick', 'aria-label': 'Tu orden' });
  const check = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Revisar orden', disabled: true });
  const reset = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Empezar de nuevo' });
  const a = activity('Ordena', b.q, h('div', {}, h('p', { class: 'th-hint', text: 'Toca los elementos en el orden correcto.' }), pick, pool, h('div', { class: 'row th-row' }, check, reset)), done);
  let chosen = [];
  const chip = (item) => {
    const c = h('button', { class: `chip th-chip${b.colores ? ' th-chip--wire' : ''}`, type: 'button' });
    if (b.colores) {
      const [stripe, base] = item.color.split('/');
      const sw = h('span', { class: 'wire', 'aria-hidden': 'true' });
      sw.style.setProperty('--a', base ?? stripe);
      sw.style.setProperty('--b', stripe);
      c.append(sw);
    }
    c.append(item.x);
    return c;
  };
  const items = b.items.map((it, i) => ({ ...(typeof it === 'string' ? { x: it } : it), i }));
  const draw = () => {
    pick.replaceChildren(...chosen.map((it, n) => h('li', {}, h('span', { class: 'th-pick__n', text: String(n + 1) }), chip(it))));
    pool.replaceChildren(...shuffledPool.filter((it) => !chosen.includes(it)).map((it) => {
      const c = chip(it);
      c.addEventListener('click', () => { chosen.push(it); draw(); });
      return c;
    }));
    check.disabled = chosen.length !== items.length;
  };
  let shuffledPool = shuffle(items);
  reset.addEventListener('click', () => { chosen = []; shuffledPool = shuffle(items); a.fb.replaceChildren(); draw(); });
  check.addEventListener('click', () => {
    const wrong = chosen.findIndex((it, n) => it.i !== n);
    if (wrong === -1) { a.say(true, b.fb); a.complete(); mark(); return; }
    a.say(false, `La posición ${wrong + 1} no va ahí. ${b.pista ?? ''}`);
  });
  draw();
  return a.box;
}

function blockClassify(b, mark, done) {
  const rows = h('div', { class: 'th-cls' });
  const picks = new Map();
  const check = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Revisar', disabled: true });
  const a = activity('Clasifica', b.q, h('div', {}, rows, h('div', { class: 'row th-row' }, check)), done);
  const items = shuffle(b.items.map((it, i) => ({ ...it, i })));
  for (const it of items) {
    const seg = h('div', { class: 'seg th-seg', role: 'group', 'aria-label': it.x });
    const row = h('div', { class: 'th-cls__row' }, h('span', { class: 'th-cls__x' }, rich(it.x)), seg);
    seg.append(...b.cats.map((cat, ci) => h('button', { type: 'button', 'aria-pressed': 'false', text: cat, onclick: () => {
      picks.set(it.i, ci);
      for (const x of seg.children) x.setAttribute('aria-pressed', String(x === seg.children[ci]));
      row.classList.remove('th-cls__row--bad', 'th-cls__row--ok');
      check.disabled = picks.size !== items.length;
    } })));
    it.row = row;
    rows.append(row);
  }
  check.addEventListener('click', () => {
    let bad = 0;
    for (const it of items) {
      const ok = picks.get(it.i) === it.c;
      it.row.classList.toggle('th-cls__row--bad', !ok);
      it.row.classList.toggle('th-cls__row--ok', ok);
      if (!ok) bad++;
    }
    if (bad === 0) { a.say(true, b.fb); a.complete(); mark(); } else a.say(false, `${bad} ${bad === 1 ? 'está mal ubicado' : 'están mal ubicados'}; están marcados en rojo. Cámbialos y revisa otra vez.`);
  });
  return a.box;
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').replace(/,/g, '.');

function blockWrite(b, mark, done) {
  const id = `th-in-${b.id}`;
  const input = h('input', { class: 'input th-input', id, inputmode: b.num ? 'numeric' : 'text', autocomplete: 'off', spellcheck: 'false' });
  const go = h('button', { class: 'btn btn--primary btn--sm', type: 'submit', text: 'Revisar' });
  const form = h('form', { class: 'th-write', novalidate: true }, h('label', { class: 'visually-hidden', for: id, text: 'Tu respuesta' }), input, go);
  const a = activity('Responde', b.q, form, done);
  let tries = 0;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    tries++;
    if (b.ok.map(norm).includes(norm(input.value))) { a.say(true, b.fb); a.complete(); mark(); return; }
    a.say(false, tries >= 2 && b.pista2 ? b.pista2 : (b.pista ?? 'Revisa el texto de arriba y vuelve a intentarlo.'));
  });
  return a.box;
}

function blockExplore(b, mark, done) {
  const seen = new Set();
  const detail = h('div', { class: 'th-explore__d', 'aria-live': 'polite' }, h('p', { class: 'muted', text: b.ayuda ?? 'Toca cada tarjeta para ver qué hace.' }));
  const grid = h('div', { class: 'th-explore' });
  const a = activity('Explora', b.q, h('div', {}, grid, detail), done);
  grid.append(...b.items.map((it, i) => h('button', { class: 'th-card', type: 'button', 'aria-pressed': 'false', onclick: (e) => {
    for (const x of grid.children) x.setAttribute('aria-pressed', 'false');
    e.currentTarget.setAttribute('aria-pressed', 'true');
    e.currentTarget.classList.add('is-seen');
    seen.add(i);
    detail.replaceChildren(h('p', {}, h('strong', { text: `${it.x}. ` }), rich(it.d)),
      h('p', { class: 'th-explore__n', text: `${seen.size} de ${b.items.length} vistas` }));
    if (seen.size === b.items.length) { a.complete(); mark(); }
  } }, h('span', { class: 'th-card__t', text: it.x }), it.s ? h('span', { class: 'th-card__s', text: it.s }) : null)));
  return a.box;
}

// ---------- Simuladores ----------

const TOPOS = {
  estrella: {
    nombre: 'Estrella', ends: ['A', 'B', 'C', 'D', 'E'],
    nodes: { S: [200, 110, 'switch'], A: [200, 24], B: [318, 80], C: [280, 200], D: [120, 200], E: [82, 80] },
    edges: [['S', 'A'], ['S', 'B'], ['S', 'C'], ['S', 'D'], ['S', 'E']],
    nota: 'Si falla un cable, solo ese equipo queda aislado. Si falla el switch central, cae toda la red.',
  },
  bus: {
    nombre: 'Bus', ends: ['A', 'B', 'C', 'D', 'E'],
    nodes: { t1: [60, 120, 'tap'], t2: [130, 120, 'tap'], t3: [200, 120, 'tap'], t4: [270, 120, 'tap'], t5: [340, 120, 'tap'], A: [60, 40], B: [130, 200], C: [200, 40], D: [270, 200], E: [340, 40] },
    edges: [['t1', 't2'], ['t2', 't3'], ['t3', 't4'], ['t4', 't5'], ['t1', 'A'], ['t2', 'B'], ['t3', 'C'], ['t4', 'D'], ['t5', 'E']],
    nota: 'Todos comparten un solo cable troncal. Un corte en el troncal parte la red en dos (y en un bus real, sin terminador, la señal rebota y suele caer toda).',
  },
  anillo: {
    nombre: 'Anillo', ends: ['A', 'B', 'C', 'D', 'E', 'F'], dirigido: true,
    nodes: { A: [200, 24], B: [310, 82], C: [310, 178], D: [200, 230], E: [90, 178], F: [90, 82] },
    edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'F'], ['F', 'A']],
    nota: 'Cada estación pasa los datos a la siguiente en un solo sentido. En un anillo simple, cualquier falla abre el anillo y corta la comunicación de todos.',
  },
  malla: {
    nombre: 'Malla', ends: ['A', 'B', 'C', 'D', 'E'],
    nodes: { A: [200, 24], B: [320, 100], C: [275, 220], D: [125, 220], E: [80, 100] },
    edges: [['A', 'B'], ['A', 'C'], ['A', 'D'], ['A', 'E'], ['B', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'D'], ['C', 'E'], ['D', 'E']],
    nota: 'Cada nodo se conecta con todos. Hay caminos de sobra: puedes cortar varios cables y la red sigue. A cambio, usa muchísimo cable.',
  },
  arbol: {
    nombre: 'Árbol', ends: ['A', 'B', 'C', 'D'],
    nodes: { R: [200, 26, 'router'], S1: [110, 110, 'switch'], S2: [290, 110, 'switch'], A: [60, 210], B: [160, 210], C: [240, 210], D: [340, 210] },
    edges: [['R', 'S1'], ['R', 'S2'], ['S1', 'A'], ['S1', 'B'], ['S2', 'C'], ['S2', 'D']],
    nota: 'Son estrellas colgadas de una jerarquía. Si falla un switch intermedio, queda aislada toda su rama.',
  },
};

function widgetTopology(b, mark, done) {
  let topo = 'estrella';
  const broken = new Set();
  const tried = new Set();
  const tabs = h('div', { class: 'seg th-seg th-seg--tabs', role: 'group', 'aria-label': 'Topología' });
  const stage = svg('svg', { viewBox: '0 0 400 250', class: 'th-topo', role: 'img' });
  const status = h('p', { class: 'th-topo__st', 'aria-live': 'polite' });
  const note = h('p', { class: 'muted th-topo__note' });
  const reset = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Reparar todo', onclick: () => { broken.clear(); draw(); } });
  const a = activity('Simulador', b.q ?? 'Elige una topología y toca un equipo o un cable para dañarlo. Mira quién pierde la comunicación.',
    h('div', {}, tabs, h('div', { class: 'th-stage' }, stage), status, note, h('div', { class: 'row th-row' }, reset)), done);

  const pairsOk = (t) => {
    const adj = new Map(Object.keys(t.nodes).map((n) => [n, []]));
    for (const [x, y] of t.edges) {
      if (broken.has(`${x}-${y}`) || broken.has(x) || broken.has(y)) continue;
      adj.get(x).push(y);
      if (!t.dirigido) adj.get(y).push(x);
    }
    const reach = (from) => {
      const seen = new Set([from]); const q = [from];
      while (q.length) for (const n of adj.get(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
      return seen;
    };
    const alive = t.ends.filter((e) => !broken.has(e));
    const R = new Map(alive.map((e) => [e, reach(e)]));
    let ok = 0; let total = 0;
    const lonely = new Set(alive);
    for (let i = 0; i < t.ends.length; i++) for (let j = i + 1; j < t.ends.length; j++) {
      total++;
      const p = t.ends[i]; const q = t.ends[j];
      if (R.has(p) && R.has(q) && R.get(p).has(q) && R.get(q).has(p)) { ok++; lonely.delete(p); lonely.delete(q); }
    }
    return { ok, total, lonely };
  };

  const draw = () => {
    const t = TOPOS[topo];
    for (const btn of tabs.children) btn.setAttribute('aria-pressed', String(btn.dataset.t === topo));
    const { ok, total, lonely } = pairsOk(t);
    stage.replaceChildren();
    stage.setAttribute('aria-label', `Topología ${t.nombre}. ${ok} de ${total} parejas de equipos se comunican.`);
    if (t.dirigido) {
      const defs = svg('defs');
      const m = svg('marker', { id: 'th-arrow', viewBox: '0 0 10 10', refX: 22, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      m.append(svg('path', { d: 'M0 0L10 5L0 10z', class: 'th-topo__arrow' }));
      defs.append(m); stage.append(defs);
    }
    for (const [x, y] of t.edges) {
      const id = `${x}-${y}`;
      const [x1, y1] = t.nodes[x]; const [x2, y2] = t.nodes[y];
      const g = svg('g', { class: `th-link${broken.has(id) ? ' is-broken' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Cable entre ${x} y ${y}${broken.has(id) ? ', dañado' : ''}` });
      g.append(svg('line', { x1, y1, x2, y2, class: 'th-link__hit' }), svg('line', { x1, y1, x2, y2, class: 'th-link__line', ...(t.dirigido ? { 'marker-end': 'url(#th-arrow)' } : {}) }));
      const toggle = () => { broken.has(id) ? broken.delete(id) : broken.add(id); tried.add(topo); draw(); check(); };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      stage.append(g);
    }
    for (const [n, [x, y, kind]] of Object.entries(t.nodes)) {
      if (kind === 'tap') continue;
      const isEnd = t.ends.includes(n);
      const cls = ['th-node', kind ? `th-node--${kind}` : '', broken.has(n) ? 'is-broken' : '', isEnd && lonely.has(n) && !broken.has(n) ? 'is-alone' : ''].join(' ');
      const g = svg('g', { class: cls, tabindex: 0, role: 'button', 'aria-label': `${kind === 'switch' ? 'Switch' : kind === 'router' ? 'Router' : 'Equipo'} ${n}${broken.has(n) ? ', dañado' : ''}` });
      if (kind) g.append(svg('rect', { x: x - 20, y: y - 14, width: 40, height: 28, rx: 6 }));
      else g.append(svg('circle', { cx: x, cy: y, r: 17 }));
      const label = svg('text', { x, y: y + 4.5, 'text-anchor': 'middle' });
      label.textContent = kind === 'switch' ? 'SW' : kind === 'router' ? 'R' : n;
      g.append(label);
      const toggle = () => { broken.has(n) ? broken.delete(n) : broken.add(n); tried.add(topo); draw(); check(); };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      stage.append(g);
    }
    status.replaceChildren(h('strong', { text: `${ok} de ${total}` }), ' parejas de equipos se pueden comunicar.',
      broken.size ? ` ${lonely.size ? `Quedan aislados: ${[...lonely].join(', ')}.` : 'Ningún equipo en servicio quedó aislado.'}` : ' Todo funciona: daña algo.');
    note.textContent = t.nota;
  };
  const check = () => { if (tried.size >= 3) { a.complete(); mark(); } };
  tabs.append(...Object.entries(TOPOS).map(([k, t]) => {
    const btn = h('button', { type: 'button', text: t.nombre, onclick: () => { topo = k; broken.clear(); draw(); } });
    btn.dataset.t = k;
    return btn;
  }));
  draw();
  a.fb.replaceChildren(h('p', { class: 'th-hint', text: 'Prueba al menos tres topologías para completar la actividad.' }));
  return a.box;
}

const LAYERS = [
  { capa: '7 · Aplicación', pdu: 'Datos', partes: [['Datos', 'd']] },
  { capa: '4 · Transporte', pdu: 'Segmento', partes: [['TCP', 'h4'], ['Datos', 'd']] },
  { capa: '3 · Red', pdu: 'Paquete', partes: [['IP', 'h3'], ['TCP', 'h4'], ['Datos', 'd']] },
  { capa: '2 · Enlace', pdu: 'Trama', partes: [['Ethernet', 'h2'], ['IP', 'h3'], ['TCP', 'h4'], ['Datos', 'd'], ['FCS', 'h2']] },
  { capa: '1 · Física', pdu: 'Bits', partes: [['1011 0010 0110 1101 0011…', 'bits']] },
];
const LAYER_TXT = [
  'El navegador prepara el mensaje (por ejemplo, la petición HTTP de una página). Las capas 7, 6 y 5 del modelo OSI trabajan aquí sobre los datos.',
  'Transporte corta los datos y le pone a cada pedazo un encabezado TCP con los puertos de origen y destino. Ahora es un segmento.',
  'Red agrega el encabezado IP con la dirección IP de origen y la de destino. Ahora es un paquete, y con eso los routers saben a dónde llevarlo.',
  'Enlace agrega el encabezado Ethernet con las direcciones MAC y al final un FCS para detectar errores. Ahora es una trama, la que entiende el switch.',
  'Física convierte la trama en señales: pulsos eléctricos en el cobre, luz en la fibra u ondas en Wi-Fi. Aquí solo hay bits.',
];

function widgetEncap(b, mark, done) {
  let i = 0;
  let bottom = false;
  const stack = h('ol', { class: 'th-layers' });
  const pdu = h('div', { class: 'th-pdu', 'aria-live': 'polite' });
  const txt = h('p', { class: 'th-encap__t' });
  const up = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Subir (receptor)' });
  const down = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Bajar una capa' });
  const a = activity('Simulador', b.q ?? 'Baja el mensaje por las capas como lo hace el emisor y luego súbelo como lo hace el receptor.',
    h('div', { class: 'th-encap' }, stack, h('div', {}, pdu, txt, h('div', { class: 'row th-row' }, down, up))), done);
  const draw = () => {
    stack.replaceChildren(...LAYERS.map((l, n) => h('li', { class: n === i ? 'is-on' : n < i ? 'is-past' : '' }, h('span', { text: l.capa }), h('b', { text: l.pdu }))));
    pdu.replaceChildren(h('p', { class: 'th-pdu__name', text: LAYERS[i].pdu }),
      h('div', { class: 'th-pdu__row' }, LAYERS[i].partes.map(([t, k]) => h('span', { class: `th-pdu__p th-pdu__p--${k}`, text: t }))));
    txt.textContent = LAYER_TXT[i];
    down.disabled = i === LAYERS.length - 1;
    up.disabled = i === 0;
  };
  down.addEventListener('click', () => { i = Math.min(i + 1, LAYERS.length - 1); if (i === LAYERS.length - 1) bottom = true; draw(); });
  up.addEventListener('click', () => {
    i = Math.max(i - 1, 0);
    draw();
    if (i === 0 && bottom) { a.say(true, 'Al subir, cada capa del receptor lee y quita el encabezado que puso su capa gemela en el emisor. Eso es desencapsular.'); a.complete(); mark(); }
  });
  draw();
  return a.box;
}

const SW_STEPS = [
  { from: 'A', to: 'C', q: 'El switch acaba de encenderse y su tabla MAC está vacía. A envía una trama a C. ¿Por dónde sale?', ok: 1,
    why: 'No conoce a C, así que inunda: la envía por todos los puertos menos por el que llegó. De paso aprende que A está en el puerto 1.' },
  { from: 'C', to: 'A', q: 'C le responde a A. ¿Por dónde sale ahora la trama?', ok: 0,
    why: 'Ya aprendió que A está en el puerto 1, así que la envía solo por ahí. Y aprende que C está en el puerto 3.' },
  { from: 'B', to: 'C', q: 'B le escribe a C. ¿Por dónde sale?', ok: 0,
    why: 'C ya está en la tabla (puerto 3): la trama va directo. B queda registrado en el puerto 2. Así el switch evita molestar a los demás equipos.' },
];
const PORT = { A: 1, B: 2, C: 3, D: 4 };

function widgetSwitch(b, mark, done) {
  let step = 0;
  const table = new Map();
  const diagram = svg('svg', { viewBox: '0 0 360 170', class: 'th-sw', role: 'img', 'aria-label': 'Switch con cuatro equipos en los puertos 1 a 4' });
  const tbl = h('table', { class: 'th-mac' });
  const ask = h('div', { class: 'th-sw__ask' });
  const a = activity('Simulador', b.q ?? 'Así aprende un switch: predice por qué puertos sale cada trama.',
    h('div', { class: 'th-swwrap' }, h('div', { class: 'th-stage' }, diagram), h('div', {}, h('p', { class: 'th-hint', text: 'Tabla de direcciones MAC' }), tbl), ask), done);
  const pos = { A: [45, 30], B: [45, 140], C: [315, 30], D: [315, 140] };
  const drawDiagram = (lit = []) => {
    diagram.replaceChildren();
    for (const [n, [x, y]] of Object.entries(pos)) {
      diagram.append(svg('line', { x1: x, y1: y, x2: 180, y2: 85, class: `th-sw__wire${lit.includes(n) ? ' is-lit' : ''}` }));
    }
    const box = svg('g', { class: 'th-node th-node--switch' });
    box.append(svg('rect', { x: 140, y: 66, width: 80, height: 38, rx: 7 }));
    const t = svg('text', { x: 180, y: 90, 'text-anchor': 'middle' }); t.textContent = 'Switch';
    box.append(t); diagram.append(box);
    for (const [n, [x, y]] of Object.entries(pos)) {
      const g = svg('g', { class: `th-node${lit.includes(n) ? ' is-lit' : ''}` });
      g.append(svg('circle', { cx: x, cy: y, r: 17 }));
      const l = svg('text', { x, y: y + 4.5, 'text-anchor': 'middle' }); l.textContent = n; g.append(l);
      const p = svg('text', { x: x + (x < 180 ? 30 : -30), y: y + (y < 85 ? 20 : -12), 'text-anchor': 'middle', class: 'th-sw__port' }); p.textContent = `p${PORT[n]}`;
      diagram.append(g, p);
    }
  };
  const drawTable = () => {
    tbl.replaceChildren(h('thead', {}, h('tr', {}, h('th', { text: 'MAC' }), h('th', { text: 'Puerto' }))),
      h('tbody', {}, table.size ? [...table].map(([m, p]) => h('tr', {}, h('td', { text: `MAC de ${m}` }), h('td', { text: String(p) })))
        : h('tr', {}, h('td', { colspan: 2, class: 'muted', text: 'Vacía' }))));
  };
  const drawAsk = () => {
    if (step >= SW_STEPS.length) {
      ask.replaceChildren(h('p', { text: 'Con la tabla llena, cada trama va solo al puerto correcto. Un hub, en cambio, repetiría todo por todos los puertos siempre.' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Repetir desde cero', onclick: () => { step = 0; table.clear(); drawDiagram(); drawTable(); drawAsk(); a.fb.replaceChildren(); } }));
      return;
    }
    const s = SW_STEPS[step];
    const opts = [`Solo por el puerto ${PORT[s.to]}`, 'Por todos los puertos menos el de origen'];
    ask.replaceChildren(h('p', { class: 'th-act__q' }, s.q), h('div', { class: 'th-opts' }, opts.map((o, n) => h('button', { class: 'th-opt', type: 'button', text: o, onclick: () => {
      if (n !== s.ok) { a.say(false, 'Piensa en qué sabe el switch en este momento: mira su tabla.'); return; }
      table.set(s.from, PORT[s.from]);
      const lit = s.ok === 1 ? Object.keys(PORT).filter((k) => k !== s.from) : [s.to];
      drawDiagram([s.from, ...lit]); drawTable();
      a.say(true, s.why);
      step++;
      if (step === SW_STEPS.length) { a.complete(); mark(); }
      drawAsk();
    } }))));
  };
  drawDiagram(); drawTable(); drawAsk();
  return a.box;
}

function range(label, min, max, value, unit) {
  const id = `th-r-${Math.random().toString(36).slice(2, 8)}`;
  const out = h('output', { for: id, class: 'th-range__v' });
  const input = h('input', { type: 'range', id, min, max, value, class: 'th-range__in' });
  const sync = () => { out.textContent = `${input.value} ${unit}`; };
  input.addEventListener('input', sync); sync();
  return { el: h('div', { class: 'th-range' }, h('label', { for: id, text: label }), out, input), input };
}

function widgetDistance(b, mark, done) {
  const wa = range('Cordón del área de trabajo (PC a toma)', 0, 15, 5, 'm');
  const hz = range('Enlace horizontal (toma a patch panel)', 10, 120, 96, 'm');
  const tr = range('Cordón en el cuarto (patch panel a switch)', 0, 15, 3, 'm');
  const bar = h('div', { class: 'th-cable', 'aria-hidden': 'true' });
  const checks = h('ul', { class: 'th-checks', 'aria-live': 'polite' });
  const a = activity('Simulador', b.q ?? 'Ajusta las longitudes hasta que el canal cumpla la norma.',
    h('div', {}, bar, wa.el, hz.el, tr.el, checks), done);
  const draw = () => {
    const w = +wa.input.value; const z = +hz.input.value; const t = +tr.input.value;
    const total = w + z + t;
    bar.replaceChildren(...[[w, 'PC', 'th-cable__c'], [z, 'Horizontal', 'th-cable__h'], [t, 'Switch', 'th-cable__c']].map(([v, l, c]) => {
      const s = h('span', { class: c, text: v >= 8 ? l : '' }); s.style.flexGrow = String(Math.max(v, 1)); return s;
    }));
    const rules = [
      [z <= 90, `Enlace horizontal: ${z} m (máximo 90 m)`],
      [w + t <= 10, `Cordones: ${w + t} m en total (máximo 10 m)`],
      [total <= 100, `Canal completo: ${total} m (máximo 100 m)`],
    ];
    checks.replaceChildren(...rules.map(([ok, t]) => h('li', { class: ok ? 'is-ok' : 'is-bad' }, h('span', { class: 'th-checks__i', 'aria-hidden': 'true', text: ok ? '✓' : '✕' }), `${t}${ok ? '' : ' — no cumple'}`)));
    if (rules.every(([ok]) => ok)) { a.say(true, 'El canal cumple. Fíjate que el límite real lo pone el enlace horizontal de 90 m: los 10 m restantes son para los cordones.'); a.complete(); mark(); }
    else a.fb.replaceChildren();
  };
  for (const r of [wa, hz, tr]) r.input.addEventListener('input', draw);
  draw();
  return a.box;
}

function widgetAttenuation(b, mark, done) {
  const len = range('Longitud del cable UTP', 5, 160, 40, 'm');
  const meter = h('div', { class: 'th-signal', 'aria-hidden': 'true' });
  const fill = h('span', { class: 'th-signal__fill' });
  const noise = h('span', { class: 'th-signal__noise' });
  meter.append(fill, noise);
  const msg = h('p', { class: 'th-topo__st', 'aria-live': 'polite' });
  const a = activity('Simulador', b.q ?? 'Alarga el cable y mira qué le pasa a la señal frente al ruido.', h('div', {}, len.el, meter, msg), done);
  let passed = false;
  const draw = () => {
    const m = +len.input.value;
    const level = Math.max(4, 100 * Math.exp(-m / 70));
    fill.style.width = `${level}%`;
    noise.style.left = '22%';
    const bad = level < 26;
    meter.classList.toggle('is-bad', bad);
    msg.textContent = bad
      ? `A ${m} m la señal llegó casi al nivel del ruido: el receptor confunde ceros y unos, hay errores y retransmisiones.`
      : m > 100 ? `A ${m} m todavía se reconoce, pero ya pasaste los 100 m que garantiza la norma para un canal de cobre.`
        : `A ${m} m la señal llega bien por encima del ruido.`;
    if (m > 100) passed = true;
    if (passed && m <= 100) { a.say(true, 'Por eso existen los límites de distancia: la atenuación debilita la señal con cada metro. Para ir más lejos se usa un switch intermedio o fibra óptica.'); a.complete(); mark(); }
  };
  len.input.addEventListener('input', draw);
  draw();
  a.fb.replaceChildren(h('p', { class: 'th-hint', text: 'Pasa de 100 m y luego vuelve a una longitud válida.' }));
  return a.box;
}

const OCTET_TARGETS = [192, 168, 10, 255, 172, 224];

function widgetOctet(b, mark, done) {
  const bits = [0, 0, 0, 0, 0, 0, 0, 0];
  let target = 0;
  let hits = 0;
  const row = h('div', { class: 'th-octet' });
  const val = h('p', { class: 'th-octet__v', 'aria-live': 'polite' });
  const goal = h('p', { class: 'th-act__q' });
  const a = activity('Simulador', b.q ?? 'Enciende los bits para formar el número que se pide.', h('div', {}, goal, row, val), done);
  const nextTarget = () => { target = OCTET_TARGETS[hits % OCTET_TARGETS.length]; goal.replaceChildren('Forma el ', h('strong', { text: String(target) }), ` (${hits} de 3 logrados)`); };
  const draw = () => {
    row.replaceChildren(...bits.map((v, i) => h('button', { class: 'th-bit', type: 'button', 'aria-pressed': String(Boolean(v)), 'aria-label': `Bit de valor ${2 ** (7 - i)}`, onclick: () => {
      bits[i] = v ? 0 : 1; draw();
    } }, h('span', { class: 'th-bit__w', text: String(2 ** (7 - i)) }), h('span', { class: 'th-bit__v', text: String(v) }))));
    const n = bits.reduce((s, v, i) => s + v * 2 ** (7 - i), 0);
    val.replaceChildren(h('code', { text: bits.join('') }), ' = ', h('strong', { text: String(n) }),
      n ? ` (${bits.map((v, i) => (v ? 2 ** (7 - i) : 0)).filter(Boolean).join(' + ')})` : '');
    if (n === target) {
      hits++;
      if (hits >= 3) { a.say(true, 'Cada octeto va de 0 (todo apagado) a 255 (todo encendido). Por eso ningún número de una IPv4 pasa de 255.'); a.complete(); mark(); goal.textContent = 'Lo lograste. Sigue jugando si quieres.'; target = -1; return; }
      a.say(true, `${target} en binario es ${bits.join('')}. Siguiente.`);
      bits.fill(0); nextTarget(); setTimeout(draw, 450);
    }
  };
  nextTarget(); draw();
  return a.box;
}

function widgetMask(b, mark, done) {
  const pre = range('Prefijo', 8, 30, 24, '');
  const out = h('div', { class: 'th-mask', 'aria-live': 'polite' });
  const a = activity('Simulador', b.q ?? 'Mueve el prefijo y encuentra el que deja exactamente 62 hosts útiles.', h('div', {}, pre.el, out), done);
  const draw = () => {
    const p = +pre.input.value;
    pre.el.querySelector('output').textContent = `/${p}`;
    const bin = Array.from({ length: 32 }, (_, i) => (i < p ? '1' : '0')).join('');
    const oct = [0, 8, 16, 24].map((s) => parseInt(bin.slice(s, s + 8), 2));
    const hb = 32 - p;
    const hosts = 2 ** hb - 2;
    const bits = h('p', { class: 'th-mask__bits' }, [0, 8, 16, 24].map((s, k) => h('span', {},
      h('span', { class: 'th-mask__n', text: bin.slice(s, s + 8).replace(/0/g, '') }),
      h('span', { class: 'th-mask__h', text: bin.slice(s, s + 8).replace(/1/g, '') }), k < 3 ? '.' : '')));
    out.replaceChildren(bits,
      h('dl', { class: 'th-kv' },
        h('dt', { text: 'Máscara' }), h('dd', {}, h('code', { text: oct.join('.') })),
        h('dt', { text: 'Bits de host' }), h('dd', { text: String(hb) }),
        h('dt', { text: 'Hosts útiles' }), h('dd', { text: `2^${hb} − 2 = ${hosts.toLocaleString('es-CO')}` })));
    if (p === 26) { a.say(true, '/26 deja 6 bits de host: 2^6 = 64 direcciones, menos la de red y la de broadcast, quedan 62. La máscara es 255.255.255.192.'); a.complete(); mark(); }
    else a.fb.replaceChildren();
  };
  pre.input.addEventListener('input', draw);
  draw();
  return a.box;
}

const WIDGETS = { topologia: widgetTopology, encapsulado: widgetEncap, switch: widgetSwitch, distancia: widgetDistance, atenuacion: widgetAttenuation, octeto: widgetOctet, mascara: widgetMask };
const ACTIVE = { pregunta: blockQuestion, revela: blockReveal, ordenar: blockOrder, clasificar: blockClassify, escribir: blockWrite, explorar: blockExplore };

/** Pinta la teoría de una unidad. onProgress(hechas, total) avisa cada vez que se completa una actividad. */
export function renderTheory(unitId, lesson, onProgress) {
  const all = loadDone();
  const done = new Set(Array.isArray(all[unitId]) ? all[unitId] : []);
  const ids = [];
  const mk = (id) => () => {
    if (done.has(id)) return;
    done.add(id);
    all[unitId] = [...done];
    saveDone(all);
    onProgress?.(ids.filter((x) => done.has(x)).length, ids.length);
  };
  const block = (b, key) => {
    if (b.t === 'p') return h('p', {}, rich(b.x));
    if (b.t === 'lista') return h('ul', { class: 'th-list' }, b.items.map((x) => h('li', {}, rich(x))));
    if (b.t === 'nota') return h('aside', { class: `th-note${b.tipo === 'ojo' ? ' th-note--ojo' : ''}` }, b.titulo ? h('strong', { text: b.titulo }) : null, h('p', {}, rich(b.x)));
    if (b.t === 'tabla') return h('div', { class: 'th-table' }, h('table', {}, h('thead', {}, h('tr', {}, b.cab.map((c) => h('th', { text: c })))),
      h('tbody', {}, b.filas.map((f) => h('tr', {}, f.map((c) => h('td', {}, rich(c))))))));
    const fn = b.t === 'widget' ? WIDGETS[b.w] : ACTIVE[b.t];
    if (!fn) return null;
    const id = b.id ?? key;
    ids.push(id);
    return fn(b, mk(id), done.has(id));
  };
  const sections = (lesson?.secciones ?? []).map((s, si) => h('section', { class: 'th-sec', 'aria-labelledby': `th-${unitId}-${si}` },
    h('h2', { id: `th-${unitId}-${si}` }, h('span', { class: 'th-sec__n', 'aria-hidden': 'true', text: String(si + 1) }), s.titulo),
    s.bloques.map((b, bi) => block(b, `${si}-${bi}`))));
  return { nodes: sections, total: ids.length, done: () => ids.filter((x) => done.has(x)).length };
}
