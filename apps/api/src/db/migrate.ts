import { join } from 'node:path';
import { loadConfig } from '../config';
import { createDb, runMigrations } from './client';

const config = loadConfig();
runMigrations(createDb(join(config.DATA_DIR, 'ikrive.db')));
console.log('Migrations applied');
