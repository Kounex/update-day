import { Settings } from '@prisma/client';
import { ColorResolvable, EmbedBuilder } from 'discord.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import { Observe, ScrapeInterval } from '../types/models/observe.js';
import { prettyDateTime } from './time.js';

export interface EmbedOptions {
  description?: string;
  color?: ColorResolvable;
}

export const buildSettingsEmbed = (settings: Settings): EmbedBuilder => {
  const lastUpdated = Number(settings.updatedAtMS);
  const message = new EmbedBuilder();

  message
    .setTitle('Settings')
    .setColor('DarkBlue')
    .setDescription('The following settings are currently active for this bot:')
    .setFields([
      {
        name: 'Guild Observe Limit',
        value: `${settings.guildObserveLimit}`,
      },
      {
        name: 'User Observe Limit',
        value: `${settings.userObserveLimit}`,
      },
      {
        name: 'Amount of maximum consecutive timeouts',
        value: `${settings.consecutiveTimeoutsLimit}`,
      },
      {
        name: 'Scrape timeout',
        value: `${settings.timeout} seconds`,
      },
      {
        name: 'Notify users of a first timeout',
        value: `${settings.notifyOnFirstTimeout}`,
      },
      {
        name: 'Cumulative timeouts until users get notified',
        value: `${settings.timeoutsTillNotify}`,
      },
    ])
    .setFooter({
      text: `last updated: ${lastUpdated == 0 ? '-' : lastUpdated}`,
    });

  return message;
};

export const buildCommandResultEmbed = (
  commandResult: CommandResult
): EmbedBuilder => {
  const message = new EmbedBuilder();

  message
    .setTitle(commandResult.successful ? 'Success' : 'Error')
    .setColor(commandResult.successful ? 'DarkGreen' : 'DarkRed')
    .setDescription(commandResult.message ?? 'Command was successful!');

  return message;
};

export const buildObserveListEmbed = (
  observes: Observe[],
  activeOnly: boolean,
  compact: boolean
): EmbedBuilder => {
  const message = new EmbedBuilder();
  const embedObserves = activeOnly
    ? observes.filter((observe) => observe.active)
    : observes.sort((a, b) => Number(a.active) - Number(b.active));

  message
    .setTitle(`Your ${activeOnly ? 'active' : ''} Observes`)
    .setColor('DarkBlue')
    .setDescription(
      embedObserves.length < 1
        ? `You don't have any ${
            activeOnly ? 'active' : ''
          } Observes. Create a new Observe with \`/observe\`${
            observes.length < 0
              ? ' or change the active state of one of your existing observes with `/edit`'
              : ''
          }!`
        : null
    );

  if (embedObserves.length > 0) {
    const fields = observeFields(embedObserves, compact);

    message.setFields(fields).setFooter({
      text: `${embedObserves.length} ${activeOnly ? 'active' : ''} Observes`,
    });
  }

  return message;
};

export const buildObserveEmbed = (
  observe: Observe,
  options?: EmbedOptions
): EmbedBuilder => {
  const lastUpdated = Number(observe.updatedAtMS);
  const message = new EmbedBuilder();

  message
    .setTitle(observe.name)
    .setColor(options?.color ?? 'DarkGreen')
    .setDescription(options?.description ?? null)
    .addFields(observeFields([observe], false))
    .setFooter({
      text: `last updated: ${
        lastUpdated == 0 ? '-' : prettyDateTime(lastUpdated)
      }`,
    });

  if (observe.thumbnail != null) {
    message.setThumbnail(observe.thumbnail);
  }

  return message;
};

function observeFields(observes: Observe[], compact: boolean = false) {
  const fields = [
    {
      name: 'Name',
      value: observes.reduce((sum, observe) => `${sum}${observe.name}\n`, ''),
      inline: true,
    },
    {
      name: 'URL',
      value: observes.reduce((sum, observe) => `${sum}${observe.url}\n`, ''),
      inline: true,
    },
    {
      name: 'Scrape Interval',
      value: observes.reduce(
        (sum, observe) =>
          `${sum}${ScrapeInterval.enumText(observe.scrapeInterval.type)}\n`,
        ''
      ),
      inline: true,
    },
    {
      name: 'Last Scrape',
      value: observes.reduce(
        (sum, observe) =>
          `${sum}${
            Number(observe.lastScrapeAtMS) > 0
              ? prettyDateTime(Number(observe.lastScrapeAtMS))
              : '-'
          }\n`,
        ''
      ),
      inline: true,
    },
  ];

  if (!compact) {
    fields.push(
      {
        name: 'CSS-Selector',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.cssSelector}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Current Text',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.currentText}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'DOM Element Property',
        value: observes.reduce(
          (sum, observe) =>
            `${sum}${observe.domElementProperty ?? 'innerText (default)'}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Keep Active',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.keepActive}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Amount Scrapes',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.amountScraped}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Timeouts',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.timeouts}\n`,
          ''
        ),
        inline: true,
      }
    );
  }

  return fields;
}
