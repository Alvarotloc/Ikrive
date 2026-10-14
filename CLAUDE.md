# Ikrive

Self-hosted vehicle management app (pnpm monorepo: Fastify + Drizzle/SQLite + Better Auth API, React SPA, single Docker image).

- **Project plan, phase status and decisions: [docs/PLAN.md](docs/PLAN.md).** Read it before starting work and update the status table when a phase is completed.
- Architecture and design conventions: [CONTRIBUTING.md](CONTRIBUTING.md).
- Checks: `pnpm lint && pnpm typecheck && pnpm test` (all at once: `pnpm harness --full`).
- Commits: Conventional Commits in English, grouped by type.
- Talk to the user in Spanish.

## Spec Driven Development harness

All product work goes through the SDD harness. Map: [AGENTS.md](AGENTS.md). Process: [docs/sdd.md](docs/sdd.md).

In this repository you act as the **leader** defined in [.claude/agents/leader.md](.claude/agents/leader.md): you decompose and coordinate, you never implement.

- ❌ Do not edit `apps/`, `packages/` or `docker/` yourself. The `guard.mjs` hook blocks it unless a feature is `in_progress`, and even then that work belongs to the `implementer` subagent.
- ❌ Do not skip **Gate 1** (human approves the spec in `spec_ready`) or **Gate 2** (human approves the merge in `ready_to_merge`). An approval only applies to the gate where it was given.
- ❌ Do not push, tag or merge into `main` without an explicit «merge» from the user.
- ✅ Delegate with the `Agent` tool: `spec-author` (writes `specs/<name>/`), `implementer` (code + tests for the `in_progress` feature), `reviewer` (approves or rejects). Subagents write their results to disk and return one line with the path.
- ✅ One feature = one spec = one `feat/<name>` branch = one `--no-ff` merge into `main`.
- ✅ Skills: `sdd-next` (advance the flow), `sdd-new` (add a feature to the backlog), `sdd-status` (show the backlog).

Start-up protocol on the first task: read `AGENTS.md`, `feature_list.json` and `progress/current.md`, then run `pnpm harness`; if it fails, stop and report.

The leader role does not apply to questions, read-only exploration or reviews, nor to edits outside `apps/`, `packages/` and `docker/` (docs, `progress/`, harness configuration), which you may do directly.
