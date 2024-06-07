import { ActivityType, PresenceStatusData } from 'discord.js';
import dotenv from 'dotenv';
import { injectable } from 'inversify';
import path from 'path';
import 'reflect-metadata';
import { ConditionalKeys } from 'type-fest';
dotenv.config();

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR ? process.env.DATA_DIR : './data'
);

const CONFIG_MAP = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DATA_DIR,
  REGISTER_COMMANDS_ON_BOT: process.env.REGISTER_COMMANDS_ON_BOT === 'true',
  BOT_ACTIVITY: process.env.BOT_ACTIVITY ?? 'Observing 👀',
  BOT_ACTIVITY_TYPE: process.env.BOT_ACTIVITY_TYPE ?? 'Custom',
  BOT_STATUS: process.env.BOT_STATUS ?? 'online',
} as const;

@injectable()
export default class Config {
  readonly DISCORD_TOKEN!: string;
  readonly DATA_DIR!: string;
  readonly REGISTER_COMMANDS_ON_BOT!: boolean;
  readonly BOT_ACTIVITY!: string;
  readonly BOT_ACTIVITY_TYPE!: ActivityType;
  readonly BOT_STATUS!: PresenceStatusData;

  constructor() {
    for (const [key, value] of Object.entries(CONFIG_MAP)) {
      if (typeof value === 'undefined') {
        console.error(`Missing environment variable for ${key}`);
        process.exit(1);
      }

      if (typeof value === 'number') {
        this[key as ConditionalKeys<typeof CONFIG_MAP, number>] = value;
      } else if (typeof value === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (this as any)[key] = value.trim();
      } else if (typeof value === 'boolean') {
        this[key as ConditionalKeys<typeof CONFIG_MAP, boolean>] = value;
      } else {
        throw new Error(`Unsupported type for ${key}`);
      }
    }
  }
}
