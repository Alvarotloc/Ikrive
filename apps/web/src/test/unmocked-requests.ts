/**
 * Requests that no stub answered during the current test. `setup.ts` fails the test in `afterEach`
 * if any is left, so a missing `mockApi` route never goes unnoticed (nor reaches the network).
 */
const unmocked: string[] = [];

/** Records `request` as unmocked and returns the rejection its caller sees, naming method and URL. */
export function rejectUnmockedRequest(request: Request): Promise<never> {
  const message = `Unmocked request: ${request.method} ${request.url}. Answer it with mockApi() in the test.`;
  unmocked.push(message);
  return Promise.reject(new Error(message));
}

/** Returns the unmocked requests recorded so far and forgets them. */
export function takeUnmockedRequests(): string[] {
  return unmocked.splice(0);
}
