import { Client } from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape.js';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import {
  ScrapeResult,
  ScrapeResultType,
} from '../types/classes/scrape-result.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import { Observe } from '../types/models/observe.js';
import { buildObserveEmbed } from '../utils/build-embed.js';
import { prisma } from '../utils/db.js';

interface CheckResult {
  observes?: Observe[];
  commandResult?: CommandResult;
}

@injectable()
export default class {
  constructor(
    @inject(TYPES.Client)
    private readonly client: Client,
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService,
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  public async getObserves(options: {
    guildId?: string;
    userId?: string;
    name?: string;
    active?: boolean;
  }): Promise<Observe[]> {
    return (
      await prisma.observe.findMany({
        where: {
          guildId: options.guildId,
          userId: options.userId,
          name: options.name,
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

  // The single place a scrape's *effects* (persisting the result, tracking
  // consecutive timeouts, auto-deactivating, DMing the user) get applied -
  // used by both the background scheduler and the manual `/scrape` command,
  // so triggering a scrape by hand behaves identically to a scheduled one
  // instead of silently skipping all of this (which used to leave
  // `lastScrapeAtMS`/`amountScraped` stale and could double-notify once the
  // scheduler later found the same already-seen change).
  public async processObserve(
    observe: Observe,
    options: { notify?: boolean } = {}
  ): Promise<{ scrapeResult: ScrapeResult; observe: Observe }> {
    const notify = options.notify ?? true;
    const scrapeResult = await this.scrapeService.observe(observe);

    await prisma.observe.updateMany({
      where: {
        guildId: observe.guildId,
        userId: observe.userId,
        name: observe.name,
      },
      data: {
        lastScrapeAtMS: Date.now(),
        thumbnail: observe.thumbnail,
        amountScraped: observe.amountScraped + 1,
      },
    });

    await this.handleScrapeResult(observe, scrapeResult, notify);

    // Re-fetch rather than reconstruct the post-scrape state locally - it
    // was updated across a few different branches above (timeouts,
    // consecutiveTimeouts, active), so the DB is the one source of truth a
    // caller (e.g. /scrape's reply embed) can trust for "what does this
    // Observe look like right now".
    const [updatedObserve] = await this.getObserves({
      guildId: observe.guildId,
      userId: observe.userId,
      name: observe.name,
    });

    return { scrapeResult, observe: updatedObserve ?? observe };
  }

  private async handleScrapeResult(
    observe: Observe,
    scrapeResult: ScrapeResult,
    notify: boolean
  ): Promise<void> {
    if (scrapeResult.type == ScrapeResultType.Timeout) {
      const settings = await this.settingsService.getSettings(observe.guildId);
      const consecutiveTimeouts = observe.consecutiveTimeouts + 1;
      // The bot used to *tell* users a maxed-out Observe "has been deactivated"
      // without ever actually flipping `active` to false, so it kept timing out
      // (and re-sending that same message) forever. Actually deactivate it here.
      const hasReachedTimeoutLimit =
        consecutiveTimeouts >= settings.consecutiveTimeoutsLimit;

      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          consecutiveTimeouts,
          timeouts: observe.timeouts + 1,
          active: hasReachedTimeoutLimit ? false : undefined,
        },
      });

      if (notify) {
        await this.handleTimeoutScenarios(observe, settings);
      }
      return;
    }

    if (observe.consecutiveTimeouts != 0) {
      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          consecutiveTimeouts: 0,
        },
      });
    }

    if (scrapeResult.type == ScrapeResultType.Change) {
      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          active: observe.keepActive,
        },
      });

      if (notify) {
        const user = await this.client.users.fetch(observe.userId);
        await user.send({
          content:
            'A change has been found for your following Observe - check quickly!',
          embeds: [buildObserveEmbed(observe)],
        });
      }
    }
  }

  private async handleTimeoutScenarios(
    observe: Observe,
    settings: Awaited<ReturnType<SettingsService['getSettings']>>
  ): Promise<void> {
    if (observe.consecutiveTimeouts == 0 && settings.notifyOnFirstTimeout) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `While trying to Observe \`${observe.name}\` on \`${observe.url}\`, we ran into a timeout. Check if the page itself still works and adjust if necessary. The bot will try again until it ran into a timeout \`${settings.consecutiveTimeoutsLimit}\` times consecutively where it will deactivate this Observe!`,
        embeds: [buildObserveEmbed(observe, { color: 'Orange' })],
      });
    } else if (
      observe.consecutiveTimeouts >=
      settings.consecutiveTimeoutsLimit - 1
    ) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `Your Observe \`${observe.name}\` on \`${observe.url}\` has reached the maximum amount of consecutive timeouts and has been deactivated!`,
        embeds: [buildObserveEmbed(observe, { color: 'DarkRed' })],
      });
    } else if (observe.timeouts == settings.timeoutsTillNotify - 1) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `Your Observe \`${observe.name}\` on \`${observe.url}\` has reached a total of ${settings.timeoutsTillNotify} timeouts. Make sure the URL is working. It might just temporarily (or sometimes) respond slowly which results in such a timeout. The bot might also have a too tight timeout window which an admin of this server could increase. Nonetheless: a timeout means no actual scraping has been done and depending on your scrape interval, this could leave huge time gaps where we don't know if one of your Observes might have changed. Any form of action is therefore advised!`,
        embeds: [buildObserveEmbed(observe, { color: 'Orange' })],
      });
    }
  }

  public async editObserve(
    guildId: string,
    userId: string,
    name: string,
    edits: {
      // `undefined` means "not provided, keep the current value". `cssSelector`
      // additionally supports `null` to mean "provided, clear it" (go back to
      // whole-page search), since it's the one field that can be unset.
      name?: string;
      url?: string;
      cssSelector?: string | null;
      watchText?: string;
      scrapeInterval?: string;
      keepActive?: boolean;
    }
  ): Promise<CommandResult> {
    const observes = await this.getObserves({ guildId, userId });

    // Find the [Observe] the user is trying to edit
    const currentObserve = observes.find((observe) => observe.name == name);

    // Abort edit if none is found (user used a non existing name)
    if (!currentObserve) {
      return {
        successful: false,
        message: `No Observe of yours found with the name \`${name}\`! Check your Observes with \`/list\` and choose another name if you still want to edit an Observe of yours!`,
      };
    }

    const newName = edits.name ?? currentObserve.name;

    // Check if user tries to rename the observe into another existing observe of his.
    // If so, abort edit
    if (
      newName != name &&
      observes.some((observe) => observe.name == newName)
    ) {
      return {
        successful: false,
        message: `You already have an Observe with the name \`${newName}\`! Check your Observes with \`/list\` and choose another name if you still want to edit your Observe!`,
      };
    }

    const newObserve = Observe.create(
      currentObserve.guildId,
      currentObserve.userId,
      currentObserve.createdAtMS,
      Date.now(),
      newName,
      edits.url ?? currentObserve.url,
      edits.cssSelector !== undefined
        ? edits.cssSelector
        : currentObserve.cssSelector,
      edits.watchText ?? currentObserve.watchText,
      edits.scrapeInterval ?? currentObserve.scrapeInterval,
      edits.keepActive ?? currentObserve.keepActive,
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
        observe: newObserve,
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
        message: `Did not find an Observe to delete with the name \`${name}\`. Make sure it exists with \`/list\`.`,
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
        // Without this, an Observe deactivated for hitting the consecutive
        // timeout limit comes back with that same count still maxed out -
        // one more timeout (even a single transient one) re-deactivates it
        // immediately instead of giving it a fresh run of the full limit.
        consecutiveTimeouts: 0,
      },
    });

    if (count < 1) {
      return {
        successful: false,
        message: `Did not find an Observe to reactivate with the name \`${name}\`. Make sure it exists and is currently not active with \`/list\`.`,
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
          message: `The bot has reached its limit for Observes per guild!`,
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
