import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFLSM, calculateVLSM, summarize, verifySubnet } from '../js/core/subnetting.js';

test('FLSM por número de subredes', () => {
  const r = calculateFLSM({ ip: '192.168.10.0', baseCidr: 24, criteria: 'subnets', value: 6 });
  assert.equal(r.newCidr, 27);
  assert.equal(r.totalSubnets, 8);
  assert.equal(r.subnets[1].netIp, '192.168.10.32');
  assert.equal(r.subnets[1].broadcast, '192.168.10.63');
  assert.equal(r.subnets[1].usableHosts, 30);
});

test('FLSM por hosts y límites', () => {
  assert.equal(calculateFLSM({ ip: '10.0.0.0', baseCidr: 8, criteria: 'hosts', value: 62 }).newCidr, 26);
  assert.ok(calculateFLSM({ ip: '192.168.1.0', baseCidr: 24, criteria: 'hosts', value: 300 }).error);
  assert.ok(calculateFLSM({ ip: '192.168.1.0', baseCidr: 24, criteria: 'subnets', value: 128 }).error, 'pasaría de /30');
  assert.ok(calculateFLSM({ ip: '999.1.1.1', baseCidr: 24, criteria: 'subnets', value: 2 }).error);
});

test('FLSM recorta resultados enormes', () => {
  const r = calculateFLSM({ ip: '10.0.0.0', baseCidr: 8, criteria: 'subnets', value: 100000 });
  assert.equal(r.truncated, true);
  assert.equal(r.subnets.length, 4096);
});

test('VLSM ordena de mayor a menor y alinea bloques', () => {
  const r = calculateVLSM({ ip: '192.168.1.0', baseCidr: 24, requests: [{ name: 'B', hosts: 10 }, { name: 'A', hosts: 100 }, { name: 'C', hosts: 2 }] });
  assert.deepEqual(r.subnets.map((s) => [s.name, `${s.netIp}/${s.cidr}`]), [['A', '192.168.1.0/25'], ['B', '192.168.1.128/28'], ['C', '192.168.1.144/30']]);
  assert.equal(r.freeAddresses, 256 - 128 - 16 - 4);
  const sum = summarize(r);
  assert.equal(sum.usable, 126 + 14 + 2);
});

test('VLSM sin espacio da error', () => {
  assert.ok(calculateVLSM({ ip: '192.168.1.0', baseCidr: 24, requests: [{ name: 'X', hosts: 200 }, { name: 'Y', hosts: 100 }] }).error);
});

test('verificador de subred', () => {
  const v = verifySubnet('192.168.1.130', '255.255.255.192');
  assert.equal(v.error, undefined);
  assert.equal(verifySubnet('192.168.1.128', '/26').role, 'network');
  assert.equal(verifySubnet('192.168.1.191', '/26').role, 'broadcast');
  assert.ok(verifySubnet('192.168.1.1', '255.0.255.0').error);
});
