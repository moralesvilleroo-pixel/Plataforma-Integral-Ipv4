// Motor de subneteo FLSM / VLSM y verificador de subred (puro, sin DOM).
import {
  cidrToMask,
  cidrToMaskInt,
  cidrToWildcard,
  intToIp,
  ipToInt,
  maskToCidr,
  networkOf,
  validateIp,
} from './ipv4.js';

/** Máximo de filas que se generan para no congelar la interfaz (ej. /8 -> /30). */
export const MAX_ROWS = 4096;

function buildSubnet(id, name, netInt, cidr, extra = {}) {
  const hostBits = 32 - cidr;
  const blockSize = 2 ** hostBits;
  const broadcastInt = netInt + blockSize - 1;
  return {
    id,
    name,
    netIp: intToIp(netInt),
    cidr,
    mask: cidrToMask(cidr),
    wildcard: cidrToWildcard(cidr),
    firstIp: intToIp(netInt + 1),
    lastIp: intToIp(broadcastInt - 1),
    broadcast: intToIp(broadcastInt),
    usableHosts: blockSize - 2,
    blockSize,
    hostBits,
    ...extra,
  };
}

/**
 * FLSM: todas las subredes con la misma máscara.
 * @param {{ip:string, baseCidr:number, criteria:'subnets'|'hosts', value:number}} p
 */
export function calculateFLSM({ ip, baseCidr, criteria, value }) {
  if (!validateIp(ip)) return { error: 'Dirección IP inválida.' };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return { error: 'Ingresa un número entero mayor a cero.' };

  const newCidr = criteria === 'hosts'
    ? 32 - Math.ceil(Math.log2(n + 2))
    : baseCidr + Math.ceil(Math.log2(n));

  if (newCidr > 30) {
    return { error: 'El requerimiento excede la capacidad: el prefijo resultante sería mayor a /30.' };
  }
  if (newCidr < baseCidr) {
    return { error: `La red /${baseCidr} no tiene capacidad para ${n.toLocaleString('es')} hosts por subred.` };
  }

  const base = networkOf(ip, baseCidr);
  const totalSubnets = 2 ** (newCidr - baseCidr);
  const blockSize = 2 ** (32 - newCidr);
  const count = Math.min(totalSubnets, MAX_ROWS);

  const subnets = [];
  for (let i = 0; i < count; i++) {
    subnets.push(buildSubnet(i + 1, `Subred ${i + 1}`, base + i * blockSize, newCidr));
  }

  return {
    mode: 'FLSM',
    ip: intToIp(base),
    baseCidr,
    baseNetInt: base,
    newCidr,
    totalSubnets,
    truncated: totalSubnets > count,
    subnets,
  };
}

/**
 * VLSM: cada subred recibe la máscara mínima que cubre sus hosts.
 * Se ordena de mayor a menor para garantizar el alineamiento de bloques.
 * @param {{ip:string, baseCidr:number, requests:{name:string, hosts:number}[]}} p
 */
export function calculateVLSM({ ip, baseCidr, requests }) {
  if (!validateIp(ip)) return { error: 'Dirección IP inválida.' };
  const valid = (requests ?? []).filter((r) => Number.isInteger(r.hosts) && r.hosts > 0);
  if (valid.length === 0) return { error: 'Agrega al menos una subred con hosts mayor a cero.' };

  const sorted = valid
    .map((r, order) => ({ ...r, order }))
    .sort((a, b) => b.hosts - a.hosts || a.order - b.order);

  const base = networkOf(ip, baseCidr);
  const end = base + 2 ** (32 - baseCidr);
  let cursor = base;
  const subnets = [];

  for (const [i, r] of sorted.entries()) {
    const hostBits = Math.max(2, Math.ceil(Math.log2(r.hosts + 2)));
    const cidr = 32 - hostBits;
    const size = 2 ** hostBits;
    if (cidr < baseCidr || cursor + size > end) {
      return {
        error: `Espacio insuficiente para "${r.name || `Subred ${i + 1}`}" (${r.hosts} hosts) dentro de ${intToIp(base)}/${baseCidr}.`,
      };
    }
    subnets.push(buildSubnet(i + 1, r.name || `Subred ${i + 1}`, cursor, cidr, { reqHosts: r.hosts }));
    cursor += size;
  }

  return {
    mode: 'VLSM',
    ip: intToIp(base),
    baseCidr,
    baseNetInt: base,
    totalSubnets: subnets.length,
    truncated: false,
    subnets,
    freeAddresses: end - cursor,
  };
}

/** Estadísticas para las tarjetas de resumen. */
export function summarize(result) {
  const totalAddresses = 2 ** (32 - result.baseCidr);
  let usable = 0;
  let allocated = 0;
  if (result.mode === 'FLSM') {
    const s = result.subnets[0];
    usable = s.usableHosts * result.totalSubnets;
    allocated = s.blockSize * result.totalSubnets;
  } else {
    for (const s of result.subnets) {
      usable += s.usableHosts;
      allocated += s.blockSize;
    }
  }
  const efficiency = Math.min(100, (usable / Math.max(1, totalAddresses - 2)) * 100);
  return { totalAddresses, usable, allocated, efficiency };
}

/** Verificador: IP + máscara -> red, rango útil, broadcast. Soporta /31 y /32. */
export function verifySubnet(ipStr, maskStr) {
  if (!validateIp(ipStr)) return { error: 'IP inválida.' };
  const cidr = maskToCidr(maskStr);
  if (cidr === null) return { error: 'Máscara o prefijo inválido.' };

  const ipInt = ipToInt(ipStr);
  const netInt = (ipInt & cidrToMaskInt(cidr)) >>> 0;
  const hostBits = 32 - cidr;
  const blockSize = 2 ** hostBits;
  const broadcastInt = netInt + blockSize - 1;
  const p2p = cidr >= 31;

  let role = 'host';
  if (!p2p && ipInt === netInt) role = 'network';
  else if (!p2p && ipInt === broadcastInt) role = 'broadcast';

  return {
    ip: ipStr.trim(),
    cidr,
    hostBits,
    blockSize,
    netIp: intToIp(netInt),
    mask: cidrToMask(cidr),
    wildcard: cidrToWildcard(cidr),
    broadcast: p2p ? 'N/A' : intToIp(broadcastInt),
    firstIp: p2p ? intToIp(netInt) : intToIp(netInt + 1),
    lastIp: p2p ? intToIp(broadcastInt) : intToIp(broadcastInt - 1),
    usableHosts: cidr === 32 ? 1 : cidr === 31 ? 2 : blockSize - 2,
    role,
  };
}
