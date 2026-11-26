# AGENTS.md: update-day

Discord bot (TypeScript, discord.js, Puppeteer, Prisma/SQLite) that watches web pages and notifies
when a phrase disappears or appears or a selector's content changes. What it does, its commands,
environment variables and the dev setup are in `README.md`; release notes in `CHANGELOG.md`.

## Checks

`yarn check` (typecheck, lint, unit tests). CI (`.github/workflows/check.yml`) runs it on every push
to `main` and every pull request, plus a real-Chrome smoke test and a fresh-database migration
inside the built image. Dependabot patch updates merge only once that passes.

## Releases

- Bump `version` in `package.json`, add a `CHANGELOG.md` entry, then push `main` to the `release`
  branch. `ci.yaml` builds `ghcr.io/kounex/update-day:<version>` and creates the GitHub release.
  Every push to `release` (except README-only changes) rebuilds under the current version, so bump first.
- Dependabot patch refreshes release themselves (`dependabot-refresh.yml` → `refresh-release.yml`).
  That auto-release skips while `main` holds unreleased non-Dependabot commits that change more than
  CI or docs (`.github/`, `docs/`, any `*.md`; so editing this file doesn't pause it); those ship
  with the next normal release.
- Deployments pin an exact image version, never `latest`.

## Deployment

The production bot runs from the published image on the maintainer's server. Its deployment notes
(where it runs, which Discord application, backups, upgrade steps) are kept outside this public
repo, in the maintainer's fleet docs (`it-env/docs/machines/nas-ops.md`, the `update-day` row).

## Git

- Public repo `Kounex/update-day`. `main` is the working branch; `release` only receives pushes
  of `main` to publish.
- Not tracked: `.env` (local development only, from `.env.example`; use a separate dev
  application's token, never the production bot's), `data/` (local SQLite database), `dist/` and
  `node_modules/` (build output and dependencies).
