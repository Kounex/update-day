import { Settings } from '@prisma/client';
import { injectable } from 'inversify';
import { prisma } from '../utils/db.js';

@injectable()
export default class SettingsService {
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
      consecutiveTimeoutsLimit?: number;
      timeout?: number;
      notifyOnFirstTimeout?: boolean;
      timeoutsTillNotify?: number;
      // `null` clears it (back to the channel each Observe was created in)
      notifyChannelId?: string | null;
    }
  ): Promise<void> {
    await this.createSettings(guildId);
    await prisma.settings.update({
      where: { guildId },
      data: {
        updatedAtMS: BigInt(Date.now()),
        ...settings,
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
