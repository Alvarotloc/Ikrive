/** Runs async operations one at a time, in call order. */
export interface SerialQueue {
  /** Runs `operation` once every operation queued before it has settled, and returns its result. */
  run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * A queue for the local database: the plugin has a single connection and the proxy driver opens a
 * transaction with a plain `BEGIN`, so two concurrent operations would interleave their statements (or
 * nest a `BEGIN`). A failed operation does not block the ones behind it.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run(operation) {
      const result = tail.then(operation, operation);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
