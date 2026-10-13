import test from 'node:test';
import assert from 'node:assert/strict';
import { LockFreeQueue } from '../src/index.js';

test('single‑thread enqueue/dequeue works', t => {
  const q = new LockFreeQueue(4);
  assert.equal(q.enqueue(1), true);
  assert.equal(q.enqueue(2), true);
  assert.equal(q.dequeue(), 1);
  assert.equal(q.dequeue(), 2);
  assert.equal(q.dequeue(), undefined);
});

test('queue reports full correctly', t => {
  const q = new LockFreeQueue(2);
  assert.equal(q.enqueue('a'), true);
  assert.equal(q.enqueue('b'), true);
  assert.equal(q.isFull(), true);
  assert.equal(q.enqueue('c'), false);
});
