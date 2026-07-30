import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, INITIAL_STATE, resolveDecision } from '../public/rules.js';

test('the first turn presents three genuinely different decisions', () => {
  assert.equal(DECISIONS.length, 3);
  assert.deepEqual(new Set(DECISIONS.map((item) => item.stance)), new Set(['稳健', '激进', '保守']));
});

test('the same state and decision are reproducible', () => {
  const first = resolveDecision(INITIAL_STATE, 'investigate');
  const second = resolveDecision(INITIAL_STATE, 'investigate');
  assert.deepEqual(first, second);
});

test('direct prototyping has a visible opportunity cost', () => {
  const { nextState, audit } = resolveDecision(INITIAL_STATE, 'prototype');
  assert.ok(nextState.treasury < INITIAL_STATE.treasury);
  assert.ok(nextState.publicTrust < INITIAL_STATE.publicTrust);
  assert.match(audit.join(' '), /标准化|密封|漏气/);
});

test('unknown decisions fail closed instead of inventing an outcome', () => {
  assert.throws(() => resolveDecision(INITIAL_STATE, 'magic-solution'), /Unknown decision/);
});
