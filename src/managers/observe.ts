import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape.js';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import { Observe } from '../types/models/observe.js';
import { prisma } from '../utils/db.js';

interface CheckResult {
  observes?: Observe[];
  commandResult?: CommandResult;
}

@injectable()
export default class {
  constructor(
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService,
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  public async getObserves(options: {
    guildId?: string;
    userId?: string;
    active?: boolean;
  }): Promise<Observe[]> {
    return (
      await prisma.observe.findMany({
        where: {
          guildId: options.guildId,
          userId: options.userId,
          active: options.active,
        },
      })
    ).map((observe) => Observe.fromPrisma(observe));
  }

  public async addObserve(observe: Observe): Promise<CommandResult> {
    const checkResult = await this.checkObservesLimit(
      observe.guildId,
      observe.userId
    );

    if (!!checkResult.commandResult) {
      return checkResult.commandResult;
    }
    const observes = checkResult.observes!;

    if (observes.some((userObserve) => userObserve.name == observe.name)) {
      return {
        successful: false,
        message: `You already have an Observe with the name \`${observe.name}\`! Check your Observes with \`/list\` and choose another name if you still want to add a new one!`,
      };
    }

    const scrapeResult = await this.scrapeService.observe(observe, true);

    if (scrapeResult.successful) {
      await prisma.observe.create(observe.toPrisma());
    }

    return {
      successful: scrapeResult.successful,
      message: scrapeResult.message,
    };
  }

  public async editObserve(
    name: string,
    editedObserve: Observe
  ): Promise<CommandResult> {
    const observes = await this.getObserves({
      guildId: editedObserve.guildId,
      userId: editedObserve.userId,
    });

    // Find the [Observe] the user is trying to edit
    const currentObserve = observes.find((observe) => observe.name == name);

    // Abort edit if none is found (user used a non existing name)
    if (!currentObserve) {
      return {
        successful: false,
        message: `No Observe of yours found with the name \`${name}\`! Check your Observes with \`/list\` and choose another name if you still want to edit an Observe of yours!`,
      };
    }

    // Check if user tries to rename the observe into another existing observe of his.
    // If so, abort edit
    if (
      observes.some(
        (observe) =>
          observe.userId == editedObserve.userId &&
          observe.name == editedObserve.name &&
          name != editedObserve.name
      )
    ) {
      return {
        successful: false,
        message: `You already have an Observe with the name \`${editedObserve.name}\`! Check your Observes with \`/list\` and choose another name if you still want to edit your Observe!`,
      };
    }

    const newObserve = Observe.create(
      currentObserve.guildId,
      currentObserve.userId,
      currentObserve.createdAtMS,
      Date.now(),
      editedObserve.name,
      editedObserve.url,
      editedObserve.cssSelector,
      editedObserve.currentText,
      editedObserve.scrapeInterval,
      editedObserve.domElementProperty,
      editedObserve.keepActive,
      currentObserve.active,
      currentObserve.lastScrapeAtMS,
      currentObserve.consecutiveTimeouts,
      currentObserve.timeouts,
      currentObserve.thumbnail,
      currentObserve.amountScraped
    );

    if (newObserve instanceof Observe) {
      const { count } = await prisma.observe.updateMany({
        where: {
          guildId: newObserve.guildId,
          userId: newObserve.userId,
          name: name,
        },
        data: newObserve.toPrisma()['data'],
      });

      if (count < 1) {
        return {
          successful: false,
          message:
            'Could not edit any of your existing Observes! Make sure your input is correct!',
        };
      }

      return {
        successful: true,
      };
    } else {
      return {
        successful: false,
        message: newObserve.message,
      };
    }
  }

  public async deleteObserve(
    guildId: string,
    userId: string,
    name: string
  ): Promise<CommandResult> {
    const { count } = await prisma.observe.deleteMany({
      where: {
        guildId: guildId,
        userId: userId,
        name: name,
      },
    });

    if (count < 1) {
      return {
        successful: false,
        message: `Did not find a Observe to delete with the name \`${name}\`. Make sure it exists with \`/list\`.`,
      };
    }

    return {
      successful: true,
      message: `Your Observe \`${name}\` has been successfully deleted.`,
    };
  }

  public async reactivateObserve(
    guildId: string,
    userId: string,
    name: string
  ): Promise<CommandResult> {
    const { count } = await prisma.observe.updateMany({
      where: {
        guildId: guildId,
        userId: userId,
        name: name,
      },
      data: {
        active: true,
        updatedAtMS: Date.now(),
      },
    });

    if (count < 1) {
      return {
        successful: false,
        message: `Did not find a Observe to reactivate with the name \`${name}\`. Make sure it exists and is currently not active with \`/list\`.`,
      };
    }

    return {
      successful: true,
      message: `Your Observe \`${name}\` has been successfully reactivated.`,
    };
  }

  private async checkObservesLimit(
    guildId: string,
    userId: string
  ): Promise<CheckResult> {
    const settings = await this.settingsService.getSettings(guildId);
    const observes = await this.getObserves({ guildId: guildId });

    if (observes.length >= settings.guildObserveLimit) {
      return {
        commandResult: {
          successful: false,
          message: `The bot has reached it's limit for Observes per guild!`,
        },
      };
    }

    const userObserves = observes.filter((observe) => observe.userId == userId);

    if (userObserves.length >= settings.userObserveLimit) {
      return {
        commandResult: {
          successful: false,
          message: `You have reached the limit of Observes per user!`,
        },
      };
    }

    return { observes: observes };
  }
}
