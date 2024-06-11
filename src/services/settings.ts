import { Settings } from '@prisma/client';
import { injectable } from 'inversify/lib/annotation/injectable.js';
import { prisma } from '../utils/db.js';

interface SettingsDefaults {
  userObserveLimit: number;
  guildObserveLimit: number;
}

@injectable()
export default class SettingsService {
  constructor() {}

  public async getSettings(guildId: string): Promise<Settings> {
    const settings = await prisma.settings.findUnique({ where: { guildId } });
    if (!settings) {
      return this.createSettings(guildId);
    }

    return settings;
  }

  public async updateSettings(
    guildId: string,
    settings: {
      userObserveLimit?: number;
      guildObserveLimit?: number;
      timeoutLimit?: number;
      timeout?: number;
      notifyOnFirstTimeout?: boolean;
    }
  ): Promise<void> {
    await prisma.settings.update({
      where: { guildId },
      data: {
        updatedAtMS: BigInt(Date.now()),
        userObserveLimit: settings.userObserveLimit,
        guildObserveLimit: settings.guildObserveLimit,
        timeoutLimit: settings.timeoutLimit,
        timeout: settings.timeout,
        notifyOnFirstTimeout: settings.notifyOnFirstTimeout,
      },
    });
  }

  public async createSettings(guildId: string): Promise<Settings> {
    return prisma.settings.upsert({
      where: {
        guildId,
      },
      create: {
        guildId,
        createdAtMS: Date.now(),
      },
      update: {},
    });
  }
}
