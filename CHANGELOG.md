# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.0]

### Added

- A form for creating Observes: `/observe` without options (or **New Observe** under `/list`) opens it - name, page, text, mode and CSS selector. Submitting it shows a preview (screenshot and the text the bot found) with dropdowns for the check interval and where to notify, a keep-active toggle, and **Start watching**; nothing is saved before that. If the page doesn't fit (e.g. the text isn't there), saving stays disabled and **Edit form** reopens the form with what you entered.
- An **Edit** button on Observe details and notifications that opens the same form, filled in - `/edit` with only `current-name` does the same.
- Saving right after the preview reuses its check instead of loading the page again.

### Changed

- `/observe`'s `name` and `url` options are optional now; giving only some options opens the form pre-filled with them.

## [0.13.1]

### Changed

- Blocked sub-requests (e.g. trackers an ad-blocking DNS answers with `0.0.0.0`) are logged at debug level instead of as a warning each - a blocked page navigation still warns.

## [0.13.0]

Reliability, security and convenience overhaul.

### Added

- Watch modes: `Text disappears` (the previous behavior, still the default), `Text appears`, and `Content changes` (notifies when the text inside a CSS selector changes, showing before and after).
- Notifications carry a screenshot of what the bot saw and buttons: Open page, Keep watching / Pause, Delete.
- `notify` option on `/observe` and `/edit`: direct message (default), channel, or both. `/settings set-notify-channel` picks a server-wide channel; otherwise it's the channel the Observe was created in.
- `/preview` - see what the bot sees on a page (snippet and screenshot) and whether it would work as an Observe, without saving anything. `/observe` and `/edit` show the same view of their first check.
- `/history` - the last checks of an Observe with outcome, HTTP status and duration (the last 50 are kept per Observe).
- `/pause` - stop checking an Observe without deleting it; `/reactivate` resumes it.
- `/admin status` - version, uptime, Discord latency, scheduler and browser health, the last 24 hours of checks, and failing Observes.
- `ALLOWED_GUILD_IDS` - restrict the bot to your own servers; it leaves any other server it gets invited to.
- Container `HEALTHCHECK`, and a watchdog that restarts the process if Discord stays disconnected for 10 minutes or the scheduler hangs.
- Optional Chrome sandbox (`CHROME_SANDBOX=true` with a seccomp profile from `deploy/make-chrome-seccomp.mjs`).

### Changed

- A suspected change is confirmed by a second, fresh page load before anyone is notified.
- The bot waits for the page's network to settle and gives late-rendered text a few seconds before deciding it's gone.
- Text matching also ignores differences in whitespace and line breaks.
- Notifications fire on transitions: a `keep-active` Observe notifies once per change (instead of on every check while the change lasts) and re-arms itself when the page goes back.
- `/reactivate` (and Keep watching) no longer re-notifies about the change that was already reported.
- One shared Chrome with a concurrency limit (`SCRAPE_CONCURRENCY`, default 2) instead of a new browser process per check; it restarts itself periodically and after crashes.
- Next-check times have a little random jitter and are stored, so checks don't all fire at once after a restart.
- `/edit` checks a changed URL, text, selector or mode before saving it, and takes a new starting point from that check.
- Names are limited to 50 characters; text, selector and URL have length limits too.
- Warnings and errors are always logged (previously only with `DEBUG` set); stack traces point at the TypeScript sources.
- Smaller image: Chrome's dependencies are installed directly instead of via a second, unused Chrome. The container user is pinned to uid/gid 997.
- Discord timestamps (shown in each viewer's own timezone) in Observe details.

### Fixed

- HTTP error pages, bot-check/challenge pages and a missing CSS selector were reported as "a change has been found" (and deactivated the Observe), since the watched text was of course not on them.
- Pages rendering their content with JavaScript after loading could trigger a false change.
- A `keep-active` Observe DMed the same change on every single check.
- A notification that couldn't be delivered (DMs closed) was silently lost - and the Observe deactivated anyway.
- Anyone able to run `/observe` could make the bot open addresses on the network it runs in (`localhost`, LAN, cloud metadata), including through redirects and sub-requests, and learn from the reply whether a text was on such a page. These addresses are now refused.
- Autocomplete broke for everyone with more than 25 Observes, and `/edit`'s suggestions for URLs longer than 100 characters.
- `/delete` failed for Observes with long names (button ids over Discord's 100-character limit).
- `/edit` could save a target that doesn't work, which then reported a bogus change.
- Favicons hosted on another domain or given as relative paths were turned into broken URLs.
- `/settings notify-on-first-timeout` said "true by default" - it's false. With a failed-check limit of 1, users got the "will retry" message instead of "deactivated".
- Chrome could crash on larger pages because of Docker's small `/dev/shm`.
- `--enable-source-maps` was passed to the script instead of Node, so it never did anything.
- The bot kept checking Observes of servers it had been removed from.

## [0.12.4]

### Changed

- Dependency refresh (base image and packages), released automatically.

## [0.12.3]

### Changed

- Dependency refresh (base image and packages), released automatically.

## [0.12.2]

### Changed

- Dependency refresh (base image and packages), released automatically.

## [0.12.1]

### Changed

- Dependency refresh (base image and packages), released automatically.

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
