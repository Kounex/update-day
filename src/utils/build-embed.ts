import { Settings } from '@prisma/client';
import { Client, ColorResolvable, EmbedBuilder } from 'discord.js';
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
      text: `last updated: ${
        lastUpdated == 0 ? '-' : prettyDateTime(lastUpdated)
      }`,
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
    try {
      message.setThumbnail(observe.thumbnail);
    } catch (_) {}
  }

  return message;
};

export const buildObserveOverview = async (
  observes: Observe[],
  activeOnly: boolean,
  client: Client
): Promise<EmbedBuilder> => {
  const message = new EmbedBuilder();
  const uniqueUserIds = [...new Set(observes.map((observe) => observe.userId))];
  const users = await Promise.all(
    uniqueUserIds.map((userId) => client.users.fetch(userId))
  );
  const userIdNameMap = new Map(
    uniqueUserIds.map((userId, index) => [userId, users[index].displayName])
  );

  observes.sort(
    (ob1, ob2) =>
      Number(ob1.active) - Number(ob2.active) ||
      userIdNameMap
        .get(ob1.userId)!
        .localeCompare(userIdNameMap.get(ob2.userId)!)
  );

  message
    .setTitle('Observes Overview')
    .setColor('DarkGreen')
    .setDescription(
      `All ${activeOnly ? 'active' : ''} Observes managed by this bot`
    )
    .addFields(
      buildColumnFields(observes, [
        { name: 'User', value: (observe) => userIdNameMap.get(observe.userId)! },
        { name: 'Name', value: (observe) => observe.name },
        { name: 'URL', value: (observe) => observe.url },
        { name: 'Active', value: (observe) => formatBool(observe.active) },
        {
          name: 'Amount Scraped',
          value: (observe) => `${observe.amountScraped}`,
        },
        {
          name: 'Created At',
          value: (observe) => prettyDateTime(Number(observe.createdAtMS)),
        },
      ])
    )
    .setFooter({
      text: `${observes.length} ${activeOnly ? 'active' : ''} Observes, ${
        uniqueUserIds.length
      } users`,
    });

  return message;
};

const formatBool = (value: boolean): string => (value ? '✅' : '❌');

// Discord rejects an embed field whose `value` exceeds 1024 characters, and
// with enough Observes a single newline-joined column can get there. All
// columns for a given call show the same Observes in the same order (so
// rows still line up across columns), so the cutoff is computed once, from
// whichever column would truncate first, and applied to every column.
const MAX_FIELD_VALUE_LENGTH = 1024;
const TRUNCATION_SUFFIX_RESERVE = 40;

interface Column {
  name: string;
  inline?: boolean;
  value: (observe: Observe) => string;
}

function buildColumnFields(observes: Observe[], columns: Column[]) {
  let safeRowCount = observes.length;

  for (const column of columns) {
    let total = 0;
    for (let i = 0; i < observes.length; i++) {
      const line = `${column.value(observes[i])}\n`;
      if (
        total + line.length >
        MAX_FIELD_VALUE_LENGTH - TRUNCATION_SUFFIX_RESERVE
      ) {
        safeRowCount = Math.min(safeRowCount, i);
        break;
      }
      total += line.length;
    }
  }

  const truncated = safeRowCount < observes.length;
  const shown = observes.slice(0, safeRowCount);

  return columns.map((column) => ({
    name: column.name,
    inline: column.inline ?? true,
    value:
      (shown.map((observe) => column.value(observe)).join('\n') || '-') +
      (truncated ? `\n…and ${observes.length - safeRowCount} more` : ''),
  }));
}

function observeFields(observes: Observe[], compact: boolean = false) {
  const columns: Column[] = [
    { name: 'Name', value: (observe) => observe.name },
    { name: 'URL', value: (observe) => observe.url },
    {
      name: 'Scrape Interval',
      value: (observe) => ScrapeInterval.enumText(observe.scrapeInterval.type),
    },
    {
      name: 'Last Scrape',
      value: (observe) =>
        Number(observe.lastScrapeAtMS) > 0
          ? prettyDateTime(Number(observe.lastScrapeAtMS))
          : '-',
    },
  ];

  if (!compact) {
    columns.push(
      { name: 'Watching For', value: (observe) => observe.watchText },
      {
        name: 'CSS-Selector',
        value: (observe) => observe.cssSelector ?? 'whole page',
      },
      {
        name: 'Keep Active',
        value: (observe) => formatBool(observe.keepActive),
      },
      {
        name: 'Amount Scrapes',
        value: (observe) => `${observe.amountScraped}`,
      },
      { name: 'Timeouts', value: (observe) => `${observe.timeouts}` }
    );
  }

  return buildColumnFields(observes, columns);
}
