// Only the config and the data folder check are imported statically: the rest (Fastify, Better Auth,
// react-pdf, sharp…) takes about a second to load, and a non-writable volume must fail before that.
import { loadConfig } from './config';
import { ensureWritableDataDirOrExit } from './lib/data-dir';

const config = loadConfig();
// Before opening SQLite: a non-writable volume would otherwise crash with SQLITE_CANTOPEN.
ensureWritableDataDirOrExit(config.DATA_DIR);

const [
  { buildApp, databasePath },
  { createDb, runMigrations },
  { runOdometerNudge, startOdometerNudgeJob },
  { runReminders, startRemindersJob },
  { createNotificationDispatcher },
] = await Promise.all([
  import('./app'),
  import('./db/client'),
  import('./jobs/odometer-nudge.job'),
  import('./jobs/reminders.job'),
  import('./modules/notification-channels/dispatcher'),
]);

const db = createDb(databasePath(config));
runMigrations(db);

const app = await buildApp({ config, db });

const dispatcher = createNotificationDispatcher({ db, fetch: globalThis.fetch, baseUrl: config.BASE_URL });
const remindersJob = startRemindersJob({
  enabled: config.REMINDERS_ENABLED,
  run: async () => app.log.info(await runReminders({ db, dispatcher }), 'reminders job finished'),
  logger: app.log,
});
const odometerNudgeJob = startOdometerNudgeJob({
  enabled: config.REMINDERS_ENABLED,
  run: async () => app.log.info(await runOdometerNudge({ db, dispatcher }), 'odometer nudge job finished'),
  logger: app.log,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`Received ${signal}, shutting down`);
    remindersJob?.stop();
    odometerNudgeJob?.stop();
    await app.close();
    db.$client.close();
    process.exit(0);
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
