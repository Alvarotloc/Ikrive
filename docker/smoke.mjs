// Smoke test of a freshly started container (empty /data). No dependencies: Node >= 22.
// Usage: node docker/smoke.mjs <baseUrl>
// Exits with 1 and `✗ <check>: <detail>` on the first failed check.

const baseUrl = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('usage: node docker/smoke.mjs <baseUrl>');
  process.exit(2);
}

/** 8×8 PNG, so the photo upload goes through sharp. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4+uIBVsQwtCQAwrmjQXD54ngAAAAASUVORK5CYII=',
  'base64',
);
const HEALTH_TIMEOUT_MS = 30_000;

class CheckError extends Error {}

/** Throws a `CheckError` with `detail` when `condition` is false. */
function expect(condition, detail) {
  if (!condition) throw new CheckError(detail);
}

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(`✓ ${name}`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${detail}`);
    process.exit(1);
  }
}

let cookie = '';

function request(path, init = {}) {
  const headers = { origin: baseUrl, ...(cookie ? { cookie } : {}), ...init.headers };
  return fetch(`${baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
}

async function json(path, init) {
  const response = await request(path, init);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Kept as text below.
  }
  return { response, body, text };
}

const describe = (response, text) =>
  `${response.status} ${response.headers.get('content-type')} ${text.slice(0, 200)}`;

await check('health', async () => {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const { response, body, text } = await json('/api/health');
      if (response.status === 200 && body?.status === 'ok') return;
      last = describe(response, text);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new CheckError(`no healthy /api/health after ${HEALTH_TIMEOUT_MS / 1000}s (${last})`);
});

await check('sign-up', async () => {
  const { response, text } = await json('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'smoke@example.com', name: 'Smoke', password: 'correct-horse-battery' }),
  });
  expect(response.status === 200, describe(response, text));
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie !== '', 'no session cookie');
});

const vehicle = await check('create vehicle', async () => {
  const { response, body, text } = await json('/api/vehicles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ make: 'Seat', model: 'León', plate: '1234BCD' }),
  });
  expect(response.status === 201, describe(response, text));
  expect(typeof body?.id === 'string', `no vehicle id in ${text.slice(0, 200)}`);
  return body;
});

await check('spa index', async () => {
  const response = await request('/');
  const text = await response.text();
  expect(response.status === 200, describe(response, text));
  expect(response.headers.get('content-type')?.startsWith('text/html'), describe(response, text));
  expect(text.includes('<div id="root">'), 'index.html without <div id="root">');
});

await check('upload photo', async () => {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'photo.png');
  const { response, text } = await json(`/api/vehicles/${vehicle.id}/photo`, { method: 'PUT', body: form });
  expect(response.status === 200, describe(response, text));
});

await check('serve photo', async () => {
  const response = await request(`/api/vehicles/${vehicle.id}/photo`);
  const body = Buffer.from(await response.arrayBuffer());
  expect(response.status === 200, describe(response, body.toString('latin1')));
  expect(response.headers.get('content-type') === 'image/webp', describe(response, ''));
});

await check('report pdf', async () => {
  const response = await request(`/api/vehicles/${vehicle.id}/report.pdf`);
  const body = Buffer.from(await response.arrayBuffer());
  expect(response.status === 200, describe(response, body.toString('latin1')));
  expect(response.headers.get('content-type') === 'application/pdf', describe(response, ''));
  expect(body.subarray(0, 5).toString('latin1') === '%PDF-', 'body does not start with %PDF-');
});

console.log('smoke test passed');
