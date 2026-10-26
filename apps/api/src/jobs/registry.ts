import { JOB_NAMES, type JobName, type JobRunSummary } from '@ikrive/shared';
import type { Db } from '../db/client';
import type { NotificationDispatcher } from '../modules/notification-channels/dispatcher';
import { runOdometerNudge } from './odometer-nudge.job';
import { runReminders } from './reminders.job';

export interface JobDeps {
  db: Db;
  dispatcher: NotificationDispatcher;
  now?: Date;
}

const JOBS: Record<JobName, (deps: JobDeps) => Promise<Omit<JobRunSummary, 'job'>>> = {
  reminders: runReminders,
  'odometer-nudge': runOdometerNudge,
};

export function isJobName(name: string): name is JobName {
  return (JOB_NAMES as readonly string[]).includes(name);
}

/**
 * Runs a job by name with the same rules as the scheduler (used by the admin endpoint and the CLI
 * script). The only place that maps job names to their functions.
 */
export async function runJob(name: JobName, deps: JobDeps): Promise<JobRunSummary> {
  return { job: name, ...(await JOBS[name](deps)) };
}
