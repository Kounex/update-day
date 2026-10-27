import { ActivityType, PresenceStatusData } from 'discord.js';
import dotenv from 'dotenv';
import { injectable } from 'inversify';
import path from 'path';
import 'reflect-metadata';
dotenv.config({ quiet: true });

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR ? process.env.DATA_DIR : './data'
);

export const TIMEZONE = process.env.TIMEZONE ?? 'Europe/Berlin';

const list = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const positiveInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`${key} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }

  return value;
};

@injectable()
export default class Config {
  readonly DISCORD_TOKEN: string;
  readonly DATA_DIR = DATA_DIR;
  readonly REGISTER_COMMANDS_ON_BOT =
    process.env.REGISTER_COMMANDS_ON_BOT === 'true';

  readonly BOT_ACTIVITY = process.env.BOT_ACTIVITY ?? 'Observing 👀';
  readonly BOT_ACTIVITY_TYPE: ActivityType =
    ActivityType[
      (process.env.BOT_ACTIVITY_TYPE ?? 'Custom') as keyof typeof ActivityType
    ] ?? ActivityType.Custom;

  readonly BOT_STATUS = (process.env.BOT_STATUS ??
    'online') as PresenceStatusData;

  readonly TIMEZONE = TIMEZONE;
  // Empty means "any guild may use the bot" (the old behavior). Set it to the
  // guilds you run the bot for, so an invite elsewhere can't make your server
  // scrape arbitrary URLs for strangers.
  readonly ALLOWED_GUILD_IDS = list(process.env.ALLOWED_GUILD_IDS);
  // Off by default: scrapes of loopback/LAN/link-local addresses (including
  // via DNS or redirects) are refused, so the bot can't be used to probe the
  // network it runs in.
  readonly ALLOW_PRIVATE_NETWORK = process.env.ALLOW_PRIVATE_NETWORK === 'true';
  // Chrome's own sandbox needs user namespaces, which a default container
  // doesn't allow - see README ("Chrome sandbox") before turning this on.
  readonly CHROME_SANDBOX = process.env.CHROME_SANDBOX === 'true';
  readonly SCRAPE_CONCURRENCY = positiveInt('SCRAPE_CONCURRENCY', 2);
  readonly HEARTBEAT_FILE =
    process.env.HEARTBEAT_FILE ?? '/tmp/update-day-heartbeat';

  constructor() {
    const token = process.env.DISCORD_TOKEN?.trim();
    if (!token) {
      console.error('Missing environment variable for DISCORD_TOKEN');
      process.exit(1);
    }

    this.DISCORD_TOKEN = token;
  }

  public isGuildAllowed(guildId: string): boolean {
    return (
      this.ALLOWED_GUILD_IDS.length === 0 ||
      this.ALLOWED_GUILD_IDS.includes(guildId)
    );
  }
}
