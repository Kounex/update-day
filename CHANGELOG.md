# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0]

Full audit of every user-facing command - clarity, correctness, and message quality.

### Added

- `/delete` now asks for confirmation (Delete/Cancel buttons) before actually deleting an Observe, instead of doing it immediately on a single command.

### Changed

- `/observe`'s `scrape-interval` is now optional (it already had a documented "Hourly is the default" - it just wasn't actually possible to omit it before).
- Clarified the `keep-active` description on `/observe` and `/edit` - it previously read "If you want to deactivate the Observe once it found a change, true by default", which was backwards on both the polarity (`true` keeps it active, it doesn't deactivate it) and the stated default (it's `false`).
- `/scrape` (manual trigger) now goes through the same persistence/notification pipeline as the background scheduler, instead of bypassing it entirely - it used to leave `lastScrapeAtMS`/`amountScraped` stale, skip auto-deactivation on a found change, and could cause the same change to be DM'd to the user twice (once never, once later from the scheduler catching up).
- Uncaught-error messages shown to users no longer include raw internal error names/messages/cause - just a friendly "something went wrong, this has been logged" (full detail still goes to the debug log).
- Removed two unused Discord gateway intents (`GuildMessageReactions`, `GuildVoiceStates`) left over from the bot this project was originally forked from.
- Boolean fields in embeds (Active, Keep Active) now show ✅/❌ instead of the literal text `true`/`false`.
- Deduplicated near-identical autocomplete logic across `/delete`, `/edit`, `/list`, `/reactivate`, and `/scrape` into one shared helper.
- Assorted message-copy fixes: missing spaces after inline code in a few notifications, "on of" → "one of", "a Observe" → "an Observe", "it's limit" → "its limit".

### Fixed

- `/admin list-observes`'s `this-guild`/`active-only` options were documented as "true by default" but actually defaulted to showing **every guild's Observes, including inactive ones**, when left unset - and explicitly passing `this-guild: false` did the opposite of what it should. An admin running this with no arguments, expecting just their own guild's active Observes as documented, would see every other guild's data on this bot too.
- `/reactivate` didn't reset `consecutiveTimeouts`, so an Observe deactivated for hitting the timeout limit would immediately re-deactivate after just one more timeout instead of getting a fresh run of the full limit.
- Settings embed's "last updated" footer showed a raw millisecond timestamp instead of a formatted date.
- `buildObserveOverview` (used by `/admin list-observes`) fetched each user's Discord profile one at a time in a loop instead of in parallel.
- Multi-Observe embed fields (`/list`, `/admin list-observes`) had no guard against Discord's 1024-character field-value limit - a guild/user with enough Observes would have hit an API error building the embed. Now truncates safely with a "…and N more" note, keeping all columns aligned to the same row count.

## [0.11.2]

### Changed

- `/edit` no longer requires re-entering every field. Only `current-name` (which Observe to edit) is required - `name`, `url`, `text`, `scrape-interval`, `css-selector` and `keep-active` are all optional now, and any left empty keep their current value instead of being overwritten or reset to a default. This also fixes a latent bug where editing any field silently reset `keep-active` back to `false` if you didn't re-specify it.
- `css-selector` can be explicitly cleared back to whole-page search by typing `none`.

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
