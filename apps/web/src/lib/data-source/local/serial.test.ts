import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial';

/** A promise with its resolve/reject exposed, to settle each operation when the test decides. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSerialQueue', () => {
  it('runs operations one after another even when one fails', async () => {
    const queue = createSerialQueue();
    const events: string[] = [];
    const first = deferred<string>();
    const second = deferred<string>();

    const a = queue.run(async () => {
      events.push('a:start');
      const value = await first.promise;
      events.push('a:end');
      return value;
    });
    const b = queue.run(async () => {
      events.push('b:start');
      try {
        return await second.promise;
      } finally {
        events.push('b:end');
      }
    });
    const c = queue.run(async () => {
      events.push('c:start');
      return 'c';
    });

    await Promise.resolve();
    expect(events).toEqual(['a:start']);

    first.resolve('a');
    second.reject(new Error('b failed'));

    await expect(a).resolves.toBe('a');
    await expect(b).rejects.toThrow('b failed');
    await expect(c).resolves.toBe('c');
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start']);
  });
});
