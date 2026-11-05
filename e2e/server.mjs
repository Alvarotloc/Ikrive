// E2E server: runs the production bundle (the same one the Docker image ships) on a fresh, empty DATA_DIR.
// Started by Playwright's `webServer`. Run `pnpm build` first (`pnpm test:e2e` does it).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = join(root, 'apps/api/dist/server.js');
const webDist = join(root, 'apps/web/dist');

if (!existsSync(serverEntry) || !existsSync(join(webDist, 'index.html'))) {
  console.error('e2e: apps/api/dist or apps/web/dist is missing, run pnpm build first');
  process.exit(1);
}

const port = process.env.E2E_PORT ?? '3100';
const dataDir = mkdtempSync(join(tmpdir(), 'ikrive-e2e-'));
console.log(`e2e DATA_DIR=${dataDir}`);

const child = spawn(process.execPath, [serverEntry], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: port,
    BASE_URL: `http://127.0.0.1:${port}`,
    AUTH_SECRET: 'e2e-test-secret-0123456789abcdefghijklmnop',
    DATA_DIR: dataDir,
    WEB_DIST_DIR: webDist,
    REMINDERS_ENABLED: 'false',
    LOG_LEVEL: 'warn',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? (signal ? 0 : 1));
});
