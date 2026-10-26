import { runJobCli } from './jobs/cli';

process.exitCode = await runJobCli(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});
