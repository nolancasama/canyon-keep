import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, random } from '../src/sim/rng.js';

test('equal Mulberry32 seeds produce identical bounded streams', () => {
  const a = createRng(123456);
  const b = createRng(123456);
  const different = createRng(654321);
  const samples = [];
  const otherSamples = [];
  for (let i = 0; i < 1000; i++) {
    const value = random(a);
    assert.equal(value, random(b));
    assert.ok(value >= 0 && value < 1);
    samples.push(value);
    otherSamples.push(random(different));
  }
  assert.notDeepEqual(samples, otherSamples);
  assert.equal(a.seed, b.seed);
});

test('JSON snapshots preserve the exact continuation of the seeded stream', () => {
  const original = { rng: createRng(0xFFFFFFFE) };
  for (let i = 0; i < 37; i++) random(original);
  const restored = JSON.parse(JSON.stringify(original));
  for (let i = 0; i < 100; i++) assert.equal(random(original), random(restored));
  assert.deepEqual(original, restored);
  assert.ok(Number.isInteger(original.rng.seed));
  assert.ok(original.rng.seed >= 0 && original.rng.seed <= 0xFFFFFFFF);
});

test('zero seed remains valid and seed inputs are normalized to uint32', () => {
  const zero = createRng(0);
  assert.equal(zero.seed, 0);
  assert.notEqual(random(zero), 0);
  assert.deepEqual(createRng(-1), { seed: 0xFFFFFFFF });
  assert.deepEqual(createRng(0x100000001), { seed: 1 });
});
