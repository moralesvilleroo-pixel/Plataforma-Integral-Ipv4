import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIp, ipToInt, intToIp, cidrToMask, cidrToWildcard, maskToCidr, ipToBinary, networkOf, classify } from '../js/core/ipv4.js';

test('valida direcciones IPv4', () => {
  for (const ip of ['0.0.0.0', '192.168.1.10', '255.255.255.255', ' 10.0.0.1 ']) assert.equal(validateIp(ip), true, ip);
  for (const ip of ['256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', 'a.b.c.d', '', null]) assert.equal(validateIp(ip), false, String(ip));
});

test('convierte entre texto y entero sin perder bits', () => {
  assert.equal(ipToInt('255.255.255.255'), 4294967295);
  assert.equal(intToIp(ipToInt('172.16.254.1')), '172.16.254.1');
  assert.equal(ipToBinary('192.168.1.10'), '11000000.10101000.00000001.00001010');
});

test('máscaras y prefijos', () => {
  assert.equal(cidrToMask(26), '255.255.255.192');
  assert.equal(cidrToMask(0), '0.0.0.0');
  assert.equal(cidrToWildcard(24), '0.0.0.255');
  assert.equal(maskToCidr('/27'), 27);
  assert.equal(maskToCidr('255.255.240.0'), 20);
  assert.equal(maskToCidr('255.0.255.0'), null, 'máscara no contigua');
  assert.equal(maskToCidr('33'), null);
});

test('red de una IP', () => {
  assert.equal(intToIp(networkOf('192.168.1.130', 26)), '192.168.1.128');
});

test('clasifica rangos privados y especiales', () => {
  assert.equal(classify('10.20.30.40').type, 'Privada');
  assert.equal(classify('172.20.1.1').type, 'Privada');
  assert.equal(classify('172.32.1.1').type, 'Pública');
  assert.equal(classify('169.254.10.3').type, 'Link-local (APIPA)');
  assert.equal(classify('127.0.0.1').type, 'Loopback');
  assert.equal(classify('200.1.1.1').ipClass, 'Clase C');
});
