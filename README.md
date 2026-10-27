# Update Day

A Discord bot that watches web pages for you and lets you know the moment something changes - an item comes back in stock, a "coming soon" disappears, a price moves.

Code base is based on [muse](https://github.com/codetheweb/muse) (awesome Discord music bot).

## How it works

You create an **Observe**: a page, what to watch on it and how often to check. The bot loads the page in a real (headless) Chrome - so content rendered by JavaScript counts - and compares what a visitor would see.

| Mode | Notifies you when |
|---|---|
| Text disappears (default) | the `text` is no longer on the page, e.g. "Sold out" |
| Text appears | the `text` shows up, e.g. "In stock" |
| Content changes | the text inside `css-selector` changes, e.g. a price |

Text matching ignores case and whitespace. A `css-selector` narrows the search to one part of the page, e.g. when the text also shows up in a menu.

**Only real changes are reported.** A page that fails to load, answers with an HTTP error, shows a bot check, or misses the selector counts as a *failed check* - never as a change. After a configurable number of failed checks in a row the Observe is deactivated (and you're told why). A suspected change is confirmed by a second, fresh page load before you're notified.

**Notifications** come with a screenshot and buttons (Open page, Keep watching / Pause, Delete). They go to your DMs, a channel, or both. If your DMs are closed, the bot falls back to the channel with a mention; if nothing works, it retries instead of dropping the notification.

After notifying, an Observe goes inactive - unless `keep-active` is set, in which case it notifies once per change and re-arms itself when the page goes back.

## Commands

| Command | |
|---|---|
| `/observe` | Watch a page. Checks it once right away and shows what the bot sees |
| `/preview` | Try out url/text/selector/mode without saving anything |
| `/list` | Your Observes; `name:` shows one in detail |
| `/edit` | Change an Observe - only the options you fill in. A changed target is checked before it's saved |
| `/scrape` | Check an Observe right now |
| `/history` | The last checks of an Observe: outcome, HTTP status, duration |
| `/pause`, `/reactivate` | Stop / resume checking |
| `/delete` | Delete an Observe (asks for confirmation) |
| `/settings` | Server limits, page load timeout, failed-check rules, notification channel (Manage Server) |
| `/admin list-observes`, `/admin status` | All Observes; bot health - browser, scheduler, last 24 h of checks (Manage Server) |

## Running it

The image is published as `ghcr.io/kounex/update-day`. Example compose file:

```yaml
services:
  update-day:
    image: ghcr.io/kounex/update-day:0.13.0
    restart: unless-stopped
    volumes:
      - ./data:/data   # must be writable by uid/gid 997
    environment:
      DISCORD_TOKEN: ...
      ALLOWED_GUILD_IDS: "123456789012345678"
      CHROME_SANDBOX: "true"
    security_opt:
      - seccomp=./chrome-seccomp.json
```

Create a bot at the [Discord developer portal](https://discord.com/developers/applications) ('New Application', then 'Bot') for the token. On startup the bot logs its invite link.

### Environment variables

| Variable | Default | |
|---|---|---|
| `DISCORD_TOKEN` | - | Required |
| `DATA_DIR` | `./data` (`/data` in the image) | Where the SQLite database lives |
| `ALLOWED_GUILD_IDS` | any server | Comma-separated server ids. Others are left on join and ignored. **Set this** - otherwise anyone who invites the bot makes your server load pages for them |
| `ALLOW_PRIVATE_NETWORK` | `false` | Allow pages on private/local addresses (LAN, localhost, link-local). Off, the bot refuses them - including via redirects and sub-requests - so it can't be used to probe the network it runs in |
| `CHROME_SANDBOX` | `false` | Use Chrome's own sandbox, see below |
| `SCRAPE_CONCURRENCY` | `2` | Pages loaded at the same time |
| `TIMEZONE` | `Europe/Berlin` | For dates shown in embeds |
| `REGISTER_COMMANDS_ON_BOT` | `false` | Register slash commands globally instead of per server |
| `BOT_STATUS`, `BOT_ACTIVITY_TYPE`, `BOT_ACTIVITY` | `online`, `Custom`, `Observing 👀` | Presence |
| `DEBUG` | - | `update-day` for verbose logs. Warnings and errors are always logged |

### Chrome sandbox

Chrome's sandbox isolates the pages it renders - the main defense if a page exploits a browser bug. It needs to create user namespaces, which Docker's default seccomp profile forbids, so by default the bot runs Chrome with `--no-sandbox` and relies on the container alone.

To turn it on, generate a profile that is Docker's default plus exactly the three syscalls the sandbox needs, for your Docker version (`docker version`):

```sh
node deploy/make-chrome-seccomp.mjs 26.1.0 > chrome-seccomp.json
```

Then set `CHROME_SANDBOX=true` and `security_opt: [seccomp=./chrome-seccomp.json]` as in the compose example. The host kernel must allow unprivileged user namespaces (`/proc/sys/kernel/unprivileged_userns_clone` = 1). If Chrome can't start, `/admin status` and the logs show "No usable sandbox".

### Health

The container has a `HEALTHCHECK` (the scheduler writes a heartbeat while it runs and Discord is connected). If the bot loses Discord for 10 minutes or the scheduler hangs for 5, the process exits so the restart policy starts a fresh one.

## Development

```sh
yarn install
cp .env.example .env    # DISCORD_TOKEN of a separate dev application
yarn prisma generate
yarn migrations:run
yarn dev                # watch mode, no migrations
```

| | |
|---|---|
| `yarn check` | typecheck, lint, tests |
| `yarn test` | unit tests, plus the check pipeline against a temporary SQLite database |
| `npx tsx src/scripts/smoke.ts` | real Chrome against local test pages (needs `npx puppeteer browsers install chrome`) |
| `yarn migrations:generate` | create a migration after changing `schema.prisma` |

CI runs all of it on every push and pull request, including the smoke test inside the built image. Dependabot updates only merge once that passes.

Releases: bump `package.json`, add a `CHANGELOG.md` entry, then push `main` to the `release` branch - that builds and publishes the image and creates the GitHub release.
