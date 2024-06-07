import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape.js';
import { TYPES } from '../types.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import { Observe } from '../types/models/observe.js';
import { prisma } from '../utils/db.js';

@injectable()
export default class {
  constructor(
    @inject(TYPES.Services.Scrape) private readonly scrapeService: ScrapeService
  ) {}

  public async getObserves(userId?: string): Promise<Observe[]> {
    return (
      await prisma.observe.findMany(
        !!userId
          ? {
              where: { userId: userId },
            }
          : undefined
      )
    ).map((observe) => Observe.fromPrisma(observe));
  }

  public async addObserve(observe: Observe): Promise<CommandResult> {
    const observes = await this.getObserves(observe.userId);

    if (observes.some((userObserve) => userObserve.name == observe.name)) {
      return {
        successful: false,
        message: `You already have an observe with the name ${observe.name}! Check your observes with \`/list\` and choose another name if you still want to add a new one!`,
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
    const observes = await this.getObserves(editedObserve.userId);

    // Find the [Observe] the user is trying to edit
    const currentObserve = observes.find((observe) => observe.name == name);

    // Abort edit if none is found (user used a non existing name)
    if (!currentObserve) {
      return {
        successful: false,
        message: `No observe of yours found with the name ${name}! Check your observes with \`/list\` and choose another name if you still want to edit an observe of yours!`,
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
        message: `You already have an observe with the name ${editedObserve.name}! Check your observes with \`/list\` and choose another name if you still want to edit your observe!`,
      };
    }

    const newObserve = Observe.create(
      editedObserve.userId,
      currentObserve.createdAtMS,
      Date.now(),
      editedObserve.name,
      editedObserve.url,
      editedObserve.cssSelector,
      editedObserve.currentText,
      editedObserve.scrapeInterval,
      editedObserve.domElementProperty,
      editedObserve.keepActive,
      editedObserve.active,
      editedObserve.lastScrapeAtMS
    );

    if (newObserve instanceof Observe) {
      // Trying to find the original observe, delete it and add the new (edited) one.
      // If none has been returned, none has been deleted, so abort edit

      const { count } = await prisma.observe.updateMany({
        where: {
          userId: editedObserve.userId,
          name: name,
        },
        data: editedObserve.toPrisma()['data'],
      });

      if (count < 1) {
        return {
          successful: false,
          message:
            'Could not edit any of your existing observes! Make sure your input is correct!',
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
    userId: string,
    name: string
  ): Promise<CommandResult> {
    const { count } = await prisma.observe.deleteMany({
      where: {
        userId: userId,
        name: name,
      },
    });

    if (count < 1) {
      return {
        successful: false,
        message: `Did not find a observe to delete with the name ${name}. Make sure it exists with \`/list\`.`,
      };
    }

    return {
      successful: true,
      message: `Your Observe ${name} has been successfully deleted.`,
    };
  }
}
