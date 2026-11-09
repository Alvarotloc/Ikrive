import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Owner the data folder must have in the Docker image (user `node`). */
export const CONTAINER_UID = 1000;

/** Ids of the running process; `undefined` on platforms without them (Windows). */
export interface ProcessIds {
  uid: number | undefined;
  gid: number | undefined;
}

const currentIds = (): ProcessIds => ({ uid: process.getuid?.(), gid: process.getgid?.() });

/** The data folder does not exist and cannot be created, or the process cannot write into it. */
export class DataDirNotWritableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataDirNotWritableError';
  }
}

/** One-line explanation with the path, the process ids, the underlying error and the fix. */
export function dataDirErrorMessage(path: string, ids: ProcessIds, cause: unknown): string {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  const reason = code ?? (cause instanceof Error ? cause.message : String(cause));
  const uid = ids.uid ?? 'unknown';
  const gid = ids.gid ?? 'unknown';
  return (
    `DATA_DIR ${path} is not writable by the process (uid ${uid}, gid ${gid}): ${reason}. ` +
    `Make the folder belong to that user; with Docker Compose, run \`sudo chown -R ${CONTAINER_UID}:${CONTAINER_UID} data\` ` +
    `next to docker-compose.yml (or create it with \`mkdir data\` before the first start) and restart the container.`
  );
}

/**
 * Creates `dir` when missing and checks the process can write into it by creating and deleting a
 * probe file (catches wrong owners, missing permissions and read-only mounts). Called before the
 * SQLite database is opened, so a bad volume fails with a clear message instead of SQLITE_CANTOPEN.
 * Returns the absolute path. Throws `DataDirNotWritableError` otherwise.
 */
export function ensureWritableDataDir(dir: string, ids: ProcessIds = currentIds()): string {
  const path = resolve(dir);
  const probe = join(path, `.write-check-${process.pid}`);
  try {
    mkdirSync(path, { recursive: true });
    writeFileSync(probe, '');
    rmSync(probe, { force: true });
  } catch (error) {
    throw new DataDirNotWritableError(dataDirErrorMessage(path, ids, error), { cause: error });
  }
  return path;
}

export interface DataDirCheckDeps {
  stderr: { write(line: string): unknown };
  exit: (code: number) => never;
  ids?: ProcessIds;
}

/**
 * Startup guard: `ensureWritableDataDir`, but on failure writes the single-line message to stderr
 * and exits with code 1 (the stack trace would only bury it). Other errors are rethrown.
 */
export function ensureWritableDataDirOrExit(
  dir: string,
  deps: DataDirCheckDeps = { stderr: process.stderr, exit: process.exit },
): string {
  try {
    return ensureWritableDataDir(dir, deps.ids);
  } catch (error) {
    if (!(error instanceof DataDirNotWritableError)) throw error;
    deps.stderr.write(`${error.message}\n`);
    return deps.exit(1);
  }
}
