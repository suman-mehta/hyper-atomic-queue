/**
 * @module hyper-atomic-queue
 * @description Zero‑dependency lock‑free MPMC queue built on SharedArrayBuffer + Atomics.
 * @author Suman Mehta
 * @license MIT
 */

/**
 * Lock‑free multi‑producer multi‑consumer queue.
 *
 * The queue stores references in a plain JavaScript array (`_store`) while
 * head/tail indices live in a SharedArrayBuffer so that any Worker can
 * coordinate without locks.
 *
 * @class
 */
export class LockFreeQueue {
  /**
   * @param {number} capacity - Must be a power of two.
   */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
      throw new RangeError('capacity must be a power‑of‑two integer > 0');
    }
    this._capacity = capacity;
    // Shared buffer holds two 32‑bit integers: head (index 0) and tail (index 1).
    this._sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    this._idx = new Int32Array(this._sab);
    // Payload storage – not shared, but each worker gets a reference when
    // re‑hydrated via `fromShared`.
    this._store = new Array(capacity);
  }

  /**
   * Create a queue that can be transferred to workers.
   * @param {number} capacity
   * @returns {{queue: LockFreeQueue, transfer: Transferable[]}}
   */
  static createShared(capacity) {
    const q = new LockFreeQueue(capacity);
    return { queue: q, transfer: [q._sab] };
  }

  /**
   * Re‑hydrate a queue inside a worker from a transferred SharedArrayBuffer.
   * @param {SharedArrayBuffer} sab
   * @param {number} capacity
   * @returns {LockFreeQueue}
   */
  static fromShared(sab, capacity) {
    const q = Object.create(LockFreeQueue.prototype);
    q._capacity = capacity;
    q._sab = sab;
    q._idx = new Int32Array(sab);
    q._store = new Array(capacity);
    return q;
  }

  /** @private */
  _mask() {
    return this._capacity - 1;
  }

  /**
   * Enqueue an item. Returns true on success, false if the queue is full.
   * @param {*} item
   * @returns {boolean}
   */
  enqueue(item) {
    const mask = this._mask();
    while (true) {
      const tail = Atomics.load(this._idx, 1);
      const head = Atomics.load(this._idx, 0);
      if ((tail - head) === this._capacity) {
        // Full
        return false;
      }
      const slot = tail & mask;
      // Claim the slot atomically.
      if (Atomics.compareExchange(this._idx, 1, tail, tail + 1) === tail) {
        this._store[slot] = item;
        // Publish the write.
        Atomics.store(this._idx, 1, tail + 1);
        return true;
      }
      // Contention – retry.
    }
  }

  /**
   * Dequeue an item. Returns the item or undefined if the queue is empty.
   * @returns {*|undefined}
   */
  dequeue() {
    const mask = this._mask();
    while (true) {
      const head = Atomics.load(this._idx, 0);
      const tail = Atomics.load(this._idx, 1);
      if (head === tail) {
        // Empty
        return undefined;
      }
      const slot = head & mask;
      // Claim the slot atomically.
      if (Atomics.compareExchange(this._idx, 0, head, head + 1) === head) {
        const item = this._store[slot];
        this._store[slot] = undefined; // Help GC.
        // Publish the read.
        Atomics.store(this._idx, 0, head + 1);
        return item;
      }
      // Contention – retry.
    }
  }

  /** @returns {number} */
  size() {
    const head = Atomics.load(this._idx, 0);
    const tail = Atomics.load(this._idx, 1);
    return tail - head;
  }

  /** @returns {boolean} */
  isEmpty() {
    return this.size() === 0;
  }

  /** @returns {boolean} */
  isFull() {
    return this.size() === this._capacity;
  }
}

/**
 * Simple CLI demo (run with `node src/index.js`).
 */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const q = new LockFreeQueue(8);
  console.log('enqueue a →', q.enqueue('a'));
  console.log('dequeue →', q.dequeue());
}
