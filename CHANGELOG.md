# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.1]

### Fixed

- `puppeteer.launch()` had no `--no-sandbox` flag, so Chrome crashed immediately in this container (missing sandbox privileges) - every single scrape was silently hitting this and surfacing as a generic timeout. This was breaking every Observe, on every site.
- Some sites (this container's User-Agent literally contains `HeadlessChrome`) block requests from an obviously-automated browser - now presented as regular desktop Chrome (same bundled build, just without the giveaway tag).
- Pages using CSS `content-visibility: auto` (a real, increasingly common perf optimization) render as empty text until scrolled into view - the target element/scope is now scrolled into view before reading its text, same as a real visitor would encounter it.

## [0.11.0]

### Changed

- `/observe` and `/edit` no longer require a CSS selector. By default the bot now searches the whole page's visible text for the phrase you give it; `css-selector` is now optional and only needed to narrow the search if that phrase could also show up elsewhere on the page (nav, other products, etc). This removes the main pain point of finding a precise, unique selector for text buried in a deeply nested/generic tag.
- Renamed the `current-text` option to `text` and the underlying `currentText` column to `watchText` to match its actual meaning: the phrase you're watching for, which you'll be notified about once it's no longer found on the page.
- Removed the `dom-element-property` option entirely — it only made sense when pointing at one exact element, which conflicts with the new default of searching a broader area, and nothing was using it.

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
