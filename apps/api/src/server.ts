import { buildApp, databasePath } from './app';
import { loadConfig } from './config';
import { createDb, runMigrations } from './db/client';
import { runReminders, startRemindersJob } from './jobs/reminders.job';

const config = loadConfig();
const db = createDb(databasePath(config));
runMigrations(db);

const app = await buildApp({ config, db });

const remindersJob = startRemindersJob({
  enabled: config.REMINDERS_ENABLED,
  run: () => app.log.info(runReminders({ db }), 'reminders job finished'),
  logger: app.log,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`Received ${signal}, shutting down`);
    remindersJob?.stop();
    await app.close();
    db.$client.close();
    process.exit(0);
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
