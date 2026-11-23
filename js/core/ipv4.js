// Utilidades IPv4 puras (sin DOM): reutilizables en web, móvil y tests.

const IP_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function validateIp(ip) {
  return typeof ip === 'string' && IP_RE.test(ip.trim());
}

export function ipToInt(ip) {
  return ip
    .trim()
    .split('.')
    .reduce((acc, octet) => (((acc << 8) >>> 0) + Number(octet)) >>> 0, 0);
}

export function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function cidrToMaskInt(cidr) {
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

export const cidrToMask = (cidr) => intToIp(cidrToMaskInt(cidr));
export const cidrToWildcard = (cidr) => intToIp(~cidrToMaskInt(cidr) >>> 0);

/** Acepta "/26", "26" o "255.255.255.192". Devuelve el prefijo o null si no es válido. */
export function maskToCidr(input) {
  let s = String(input ?? '').trim();
  if (s.startsWith('/')) s = s.slice(1);
  if (/^\d{1,2}$/.test(s)) {
    const v = Number(s);
    return v >= 0 && v <= 32 ? v : null;
  }
  if (!validateIp(s)) return null;
  const bin = ipToInt(s).toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bin)) return null; // máscara no contigua
  const zero = bin.indexOf('0');
  return zero === -1 ? 32 : zero;
}

export function ipToBinary(ip) {
  return ip
    .split('.')
    .map((o) => Number(o).toString(2).padStart(8, '0'))
    .join('.');
}

export function maskToBinary(cidr) {
  let out = '';
  for (let i = 1; i <= 32; i++) {
    out += i <= cidr ? '1' : '0';
    if (i % 8 === 0 && i < 32) out += '.';
  }
  return out;
}

export function networkOf(ip, cidr) {
  return (ipToInt(ip) & cidrToMaskInt(cidr)) >>> 0;
}

/** Clase, tipo de dirección y máscara por defecto. */
export function classify(ip) {
  const [a, b] = ip.split('.').map(Number);
  let ipClass;
  let defaultCidr = null;
  let range;

  if (a === 0) { ipClass = 'Reservada'; range = '0'; }
  else if (a <= 127) { ipClass = 'Clase A'; defaultCidr = 8; range = '1 - 127'; }
  else if (a <= 191) { ipClass = 'Clase B'; defaultCidr = 16; range = '128 - 191'; }
  else if (a <= 223) { ipClass = 'Clase C'; defaultCidr = 24; range = '192 - 223'; }
  else if (a <= 239) { ipClass = 'Clase D (Multicast)'; range = '224 - 239'; }
  else { ipClass = 'Clase E (Experimental)'; range = '240 - 255'; }

  let type = 'Pública';
  if (a === 0) type = 'Reservada';
  else if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) type = 'Privada';
  else if (a === 127) type = 'Loopback';
  else if (a === 169 && b === 254) type = 'Link-local (APIPA)';
  else if (a === 100 && b >= 64 && b <= 127) type = 'CGNAT (compartida)';
  else if (a >= 224 && a <= 239) type = 'Multicast';
  else if (a >= 240) type = 'Reservada';

  return {
    ipClass,
    type,
    defaultCidr,
    defaultMask: defaultCidr ? `${cidrToMask(defaultCidr)} (/${defaultCidr})` : 'N/A',
    range,
  };
}
