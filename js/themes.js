// Paletas 60/30/10 que la persona puede elegir. Se guardan solo en este dispositivo.
export const THEMES = [
  { id: 'marino', name: 'Marino Esmeralda', desc: 'Institucional limpio', c: ['#1E3A8A', '#4B5563', '#10B981'] },
  { id: 'obsidiana', name: 'Obsidiana Cian', desc: 'Ingeniería moderna', c: ['#0F172A', '#334155', '#38BDF8'] },
  { id: 'grafito', name: 'Grafito Ámbar', desc: 'Terminal cálido', c: ['#18181B', '#3F3F46', '#F59E0B'] },
  { id: 'abismo', name: 'Abismo Violeta', desc: 'Profundo y suave', c: ['#1E1B4B', '#374151', '#A78BFA'] },
  { id: 'bosque', name: 'Bosque Menta', desc: 'Descanso visual', c: ['#064E3B', '#374151', '#34D399'] },
  { id: 'carbon', name: 'Carbón Coral', desc: 'Acento vibrante', c: ['#111827', '#374151', '#FB7185'] },
  { id: 'turquesa', name: 'Noche Turquesa', desc: 'Técnico y fresco', c: ['#164E63', '#334155', '#2DD4BF'] },
  { id: 'lima', name: 'Pizarra Lima', desc: 'Laboratorio', c: ['#090D16', '#27272A', '#A3E635'] },
  { id: 'indigo', name: 'Índigo Dorado', desc: 'Ejecutivo oscuro', c: ['#172554', '#334155', '#FBBF24'] },
  { id: 'ciruela', name: 'Ciruela Neón', desc: 'Nocturno expresivo', c: ['#2E1065', '#3F3F46', '#F472B6'] },
];

const KEY = 'subnetpro:theme';

export function currentTheme() {
  try { return THEMES.find((t) => t.id === localStorage.getItem(KEY))?.id ?? 'marino'; } catch { return 'marino'; }
}

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  if (theme.id === 'marino') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.c[0]);
  try { localStorage.setItem(KEY, theme.id); } catch { /* sin almacenamiento: dura hasta cerrar */ }
}
