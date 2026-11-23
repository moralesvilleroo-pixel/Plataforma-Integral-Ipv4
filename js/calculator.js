// Calculadora FLSM, VLSM y verificador de subred, sobre el motor de src/core.
import { h } from './lib.js';
import { calculateFLSM, calculateVLSM, summarize, verifySubnet } from './core/subnetting.js';
import { classify, validateIp } from './core/ipv4.js';

const MAX_SHOWN = 256;
const fmt = (n) => Number(n).toLocaleString('es-CO');

function field(id, label, input, hint) {
  return h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    input,
    hint ? h('small', { text: hint }) : null,
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

function prefixSelect(id, from, to, selected) {
  const sel = h('select', { class: 'select', id, name: id });
  for (let c = from; c <= to; c++) sel.append(h('option', { value: c, selected: c === selected, text: `/${c}` }));
  return sel;
}

function errorPanel(msg) {
  return h('div', { class: 'panel state', role: 'alert' },
    h('h2', { text: 'No se pudo calcular' }), h('p', { text: msg }));
}

function table(result) {
  const rows = result.subnets.slice(0, MAX_SHOWN);
  const vlsm = result.mode === 'VLSM';
  const head = ['#', vlsm ? 'Nombre' : null, 'Red', 'Máscara', 'Primera útil', 'Última útil', 'Broadcast', 'Hosts útiles'].filter(Boolean);
  return h('div', {},
    h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabla de subredes' },
      h('table', {},
        h('thead', {}, h('tr', {}, head.map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, rows.map((s) => h('tr', {},
          h('td', { text: s.id }),
          vlsm ? h('td', { text: s.name }) : null,
          h('td', { text: `${s.netIp}/${s.cidr}` }),
          h('td', { text: s.mask }),
          h('td', { text: s.firstIp }),
          h('td', { text: s.lastIp }),
          h('td', { text: s.broadcast }),
          h('td', { text: fmt(s.usableHosts) }),
        ))))),
    result.totalSubnets > rows.length
      ? h('p', { class: 'eyebrow-num', text: `Se muestran las primeras ${fmt(rows.length)} de ${fmt(result.totalSubnets)} subredes.` })
      : null);
}

function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
}

function flsmForm(out) {
  const form = h('form', { class: 'panel', novalidate: true },
    h('div', { class: 'grid-form' },
      field('f-ip', 'Red base', h('input', { class: 'input', id: 'f-ip', value: '192.168.1.0', inputmode: 'decimal', autocomplete: 'off' })),
      field('f-cidr', 'Prefijo base', prefixSelect('f-cidr', 8, 30, 24)),
      field('f-crit', 'Calcular por', h('select', { class: 'select', id: 'f-crit' },
        h('option', { value: 'subnets', text: 'Número de subredes' }),
        h('option', { value: 'hosts', text: 'Hosts por subred' }))),
      field('f-val', 'Cantidad', h('input', { class: 'input', id: 'f-val', value: '6', inputmode: 'numeric', autocomplete: 'off' })),
    ),
    h('div', { class: 'row order-actions' }, h('button', { class: 'btn btn--primary', type: 'submit', text: 'Calcular FLSM' })));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = form.querySelector('#f-ip').value.trim();
    const val = form.querySelector('#f-val').value.trim();
    const okIp = setErr(form, 'f-ip', validateIp(ip) ? null : 'Escribe una IPv4 válida, por ejemplo 192.168.1.0.');
    const okVal = setErr(form, 'f-val', /^\d+$/.test(val) && Number(val) > 0 ? null : 'Escribe un número entero mayor que cero.');
    if (!okIp || !okVal) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    const r = calculateFLSM({ ip, baseCidr: Number(form.querySelector('#f-cidr').value), criteria: form.querySelector('#f-crit').value, value: Number(val) });
    if (r.error) { out.replaceChildren(errorPanel(r.error)); return; }
    const sum = summarize(r);
    out.replaceChildren(h('section', { class: 'panel', 'aria-label': 'Resultado FLSM' },
      h('h2', { text: `${r.ip}/${r.baseCidr} en /${r.newCidr}` }),
      kv([
        ['Máscara nueva', r.subnets[0].mask],
        ['Subredes', fmt(r.totalSubnets)],
        ['Hosts útiles por subred', fmt(r.subnets[0].usableHosts)],
        ['Aprovechamiento', `${sum.efficiency.toFixed(1)} %`],
      ]),
      table(r)));
  });
  return form;
}

function vlsmForm(out) {
  const rows = h('div', { class: 'vlsm-rows' });
  let seq = 0;
  const addRow = (name = '', hosts = '') => {
    seq += 1;
    const id = `v-${seq}`;
    const row = h('div', { class: 'vlsm-row' },
      h('span', {},
        h('label', { class: 'visually-hidden', for: `${id}-n`, text: 'Nombre de la subred' }),
        h('input', { class: 'input', id: `${id}-n`, value: name, placeholder: 'Nombre', maxlength: 40, autocomplete: 'off' })),
      h('span', {},
        h('label', { class: 'visually-hidden', for: `${id}-h`, text: 'Hosts necesarios' }),
        h('input', { class: 'input', id: `${id}-h`, value: hosts, placeholder: 'Hosts', inputmode: 'numeric', autocomplete: 'off' })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar esta subred', text: '×',
        onclick: () => { if (rows.children.length > 1) row.remove(); } }));
    rows.append(row);
  };
  [['Laboratorio', '60'], ['Administración', '28'], ['Enlace router', '2']].forEach(([n, v]) => addRow(n, v));

  const form = h('form', { class: 'panel', novalidate: true },
    h('div', { class: 'grid-form' },
      field('v-ip', 'Red base', h('input', { class: 'input', id: 'v-ip', value: '192.168.20.0', inputmode: 'decimal', autocomplete: 'off' })),
      field('v-cidr', 'Prefijo base', prefixSelect('v-cidr', 8, 30, 24))),
    h('h2', { class: 'order-actions', text: 'Subredes y hosts' }),
    rows,
    h('span', { class: 'err', id: 'v-rows-err', hidden: true }),
    h('div', { class: 'row order-actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Agregar subred', onclick: () => { addRow(); rows.lastElementChild.querySelector('input').focus(); } }),
      h('button', { class: 'btn btn--primary', type: 'submit', text: 'Calcular VLSM' })));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = form.querySelector('#v-ip').value.trim();
    if (!setErr(form, 'v-ip', validateIp(ip) ? null : 'Escribe una IPv4 válida.')) { form.querySelector('#v-ip').focus(); return; }
    const requests = [...rows.children].map((r) => {
      const [n, hh] = r.querySelectorAll('input');
      return { name: n.value.trim(), hosts: /^\d+$/.test(hh.value.trim()) ? Number(hh.value.trim()) : NaN };
    });
    const rowsErr = form.querySelector('#v-rows-err');
    const bad = requests.some((r) => !Number.isInteger(r.hosts) || r.hosts < 1);
    rowsErr.hidden = !bad;
    rowsErr.textContent = bad ? 'Cada subred necesita un número de hosts entero mayor que cero.' : '';
    if (bad) return;
    const r = calculateVLSM({ ip, baseCidr: Number(form.querySelector('#v-cidr').value), requests });
    if (r.error) { out.replaceChildren(errorPanel(r.error)); return; }
    out.replaceChildren(h('section', { class: 'panel', 'aria-label': 'Resultado VLSM' },
      h('h2', { text: `${r.ip}/${r.baseCidr} en ${r.totalSubnets} subredes` }),
      kv([['Direcciones libres al final', fmt(r.freeAddresses)], ['Orden', 'De la subred más grande a la más pequeña']]),
      table(r)));
  });
  return form;
}

function verifyForm(out) {
  const form = h('form', { class: 'panel', novalidate: true },
    h('div', { class: 'grid-form' },
      field('c-ip', 'Dirección IP', h('input', { class: 'input', id: 'c-ip', value: '172.16.37.100', inputmode: 'decimal', autocomplete: 'off' })),
      field('c-mask', 'Máscara o prefijo', h('input', { class: 'input', id: 'c-mask', value: '/27', autocomplete: 'off' }), 'Acepta /27, 27 o 255.255.255.224')),
    h('div', { class: 'row order-actions' }, h('button', { class: 'btn btn--primary', type: 'submit', text: 'Verificar dirección' })));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = form.querySelector('#c-ip').value.trim();
    const mask = form.querySelector('#c-mask').value.trim();
    const r = verifySubnet(ip, mask);
    if (r.error) {
      const isIp = r.error.startsWith('IP');
      setErr(form, 'c-ip', isIp ? 'Escribe una IPv4 válida.' : null);
      setErr(form, 'c-mask', isIp ? null : 'Máscara o prefijo no válido.');
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }
    setErr(form, 'c-ip', null);
    setErr(form, 'c-mask', null);
    const cls = classify(ip);
    const role = { network: 'Es la dirección de red: no se asigna a equipos', broadcast: 'Es el broadcast: no se asigna a equipos', host: 'Es una dirección de host válida' }[r.role];
    out.replaceChildren(h('section', { class: 'panel', 'aria-label': 'Resultado del verificador' },
      h('h2', { text: `${r.ip}/${r.cidr}` }),
      h('p', { text: role }),
      kv([
        ['Red', r.netIp], ['Máscara', r.mask], ['Wildcard', r.wildcard], ['Broadcast', r.broadcast],
        ['Primera útil', r.firstIp], ['Última útil', r.lastIp], ['Hosts útiles', fmt(r.usableHosts)],
        ['Clase y tipo', `${cls.ipClass}, ${cls.type}`],
      ])));
  });
  return form;
}

export function renderCalculator(root) {
  const out = h('div', { class: 'order-actions', 'aria-live': 'polite' });
  const holder = h('div');
  const modes = [['flsm', 'FLSM', flsmForm], ['vlsm', 'VLSM', vlsmForm], ['ver', 'Verificar IP', verifyForm]];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo de cálculo' });
  const select = (key) => {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.k === key));
    const [, , make] = modes.find(([k]) => k === key);
    holder.replaceChildren(make(out));
    out.replaceChildren(h('p', { class: 'eyebrow-num', text: 'Completa los datos y pulsa el botón para ver el resultado.' }));
  };
  for (const [k, label] of modes) seg.append(h('button', { type: 'button', 'data-k': k, onclick: () => select(k) }, label));

  root.replaceChildren(h('div', { class: 'enter' },
    h('header', { class: 'view-head' },
      h('h1', { tabindex: '-1', text: 'Calculadora de subredes' }),
      h('p', { class: 'lead', text: 'Comprueba tus ejercicios: FLSM por subredes o por hosts, VLSM por departamentos y verificación de una IP con su máscara.' })),
    h('div', { class: 'row', style: null }, seg),
    h('div', { class: 'order-actions' }, holder),
    out));
  select('flsm');
  root.querySelector('h1').focus();
}
