import { buildApp, databasePath } from './app';
import { loadConfig } from './config';
import { createDb, runMigrations } from './db/client';

const config = loadConfig();
const db = createDb(databasePath(config));
runMigrations(db);

const app = await buildApp({ config, db });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    db.$client.close();
    process.exit(0);
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
