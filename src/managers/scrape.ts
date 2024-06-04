import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape';
import { TYPES } from '../types';
import { CommandResult } from '../types/interfaces/command-result';
import { Observe } from '../types/models/observe';

@injectable()
export default class {
  public readonly observers: Observe[] = [];

  constructor(
    @inject(TYPES.Services.Scrape) private readonly scrapeService: ScrapeService
  ) {}

  public async addObserve(observe: Observe): Promise<CommandResult> {
    this.observers.push(observe);

    const scrapeResult = await this.scrapeService.observe(observe, true);

    return {
      successful: scrapeResult.successful,
      message: scrapeResult.message,
    };
  }

  public editObserve(name: string, editedObserve: Observe): CommandResult {
    // Find the [Observe] the user is trying to edit
    const currentObserve = this.observers.find(
      (observe) =>
        observe.userId == editedObserve.userId && observe.name == name
    );

    // Abort edit if none is found (user used a non existing name)
    if (!currentObserve) {
      return {
        successful: false,
        message: 'No observe of yours found with the given name!',
      };
    }

    // Check if user tries to rename the observe into another existing observe of his.
    // If so, abort edit
    if (
      this.observers.some(
        (observe) =>
          observe.userId == editedObserve.userId &&
          observe.name == editedObserve.name &&
          name != editedObserve.name
      )
    ) {
      return {
        successful: false,
        message: 'Another observe of yours exists with this name already!',
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
      editedObserve.domElementProperty
    );

    if (newObserve instanceof Observe) {
      // Trying to find the original observe, delete it and add the new (edited) one.
      // If none has been returned, none has been deleted, so abort edit
      if (
        this.observers.splice(
          this.observers.indexOf(currentObserve),
          1,
          newObserve
        ).length != 1
      ) {
        return {
          successful: false,
          message: 'Could not edit your observe - check the bot logs I guess?!',
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

  public deleteObserve(userId: string, name: string): CommandResult {
    const indexToRemove = this.observers.findIndex(
      (observe) =>
        observe.userId == userId &&
        observe.name.toLocaleLowerCase().trim() ==
          name.toLocaleLowerCase().trim()
    );

    // Check if we found the observe to delete. Abort if not
    if (indexToRemove < 0) {
      return {
        successful: false,
        message: 'No observe of yours found with the given name!',
      };
    }

    // If we were able to delete the observe. Abort if not
    if (this.observers.splice(indexToRemove, 1).length < 1) {
      return {
        successful: false,
        message: 'Could not delete your observe - check the bot logs I guess?!',
      };
    }

    return {
      successful: true,
    };
  }
}
