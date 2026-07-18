# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0]

### Added

- Retry with backoff around page navigation during a scrape, instead of failing on the first transient network blip.
- Observes now actually get deactivated (and stay deactivated) once they hit the consecutive-timeout limit, instead of just claiming to be in the notification while continuing to time out forever.

### Changed

- Bumped base image to `node:22-slim` (Node 18 is EOL) and updated `discord.js`, `puppeteer`, `inversify`, `prisma`, `execa`, `typescript`, and related dependencies to current versions.
- Puppeteer's Chrome download now happens once at image build time instead of on every container start.
- `tini` is now actually wired up as the container's PID 1 (`ENTRYPOINT`) for proper signal handling/zombie reaping — it was previously installed but unused.
- Removed a batch of unused dependencies and dead config (`YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID/SECRET`, and other leftovers from the bot template this project was originally forked from).

### Fixed

- Fixed a bug where completing a scrape early could wipe in-progress tracking for every later-scheduled scrape (`Array.prototype.splice` called without a delete count), causing duplicate/concurrent scrapes.
- Fixed unhandled promise rejections in the scrape scheduler and `guildCreate` handler that could crash the entire bot process (e.g. a user with DMs disabled).
- Fixed a Puppeteer browser/process leak when a scrape errored before reaching its own `browser.close()` call.
- Fixed a missing `break` in the `/scrape` command's result handling that caused a detected change to display as "No change".
- Corrected the guild-join welcome message, which linked to a different bot's (Muse) permissions wiki page.

## [0.1.0]

### Added

- Initial release
