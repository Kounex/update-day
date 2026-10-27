import { ScrapeLog, Settings } from '@prisma/client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ColorResolvable,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import {
  ScrapeError,
  ScrapeResult,
  ScrapeSuccess,
  failureText,
} from '../types/classes/scrape-result.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import {
  notifyModeText,
  Observe,
  ScrapeInterval,
  WatchMode,
  watchModeText,
} from '../types/models/observe.js';
import { snippet } from './evaluate.js';
import { truncate } from './string.js';
import { discordTime, prettyDuration } from './time.js';

export interface EmbedOptions {
  description?: string;
  color?: ColorResolvable;
}

// What a DM or channel message consists of - shared by notifications and
// command replies so both can carry the screenshot and the action buttons.
export interface MessagePayload {
  content?: string;
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components?: Array<ActionRowBuilder<MessageActionRowComponentBuilder>>;
}

export const BUTTON_KEEP_WATCHING = 'obs:keep:';
export const BUTTON_PAUSE = 'obs:pause:';
export const BUTTON_DELETE = 'obs:delete:';
export const BUTTON_EDIT = 'obs:edit:';
export const BUTTON_NEW = 'obs:new';

const SCREENSHOT_NAME = 'screenshot.jpg';

export const formatBool = (value: boolean): string => (value ? '✅' : '❌');

const describeTarget = (observe: {
  watchMode: WatchMode;
  watchText: string;
  cssSelector: string | null;
}): string => {
  const where = observe.cssSelector ? ` in \`${observe.cssSelector}\`` : '';
  switch (observe.watchMode) {
    case WatchMode.Disappears: {
      return `when \`${observe.watchText}\` is no longer on the page${where}`;
    }

    case WatchMode.Appears: {
      return `when \`${observe.watchText}\` shows up on the page${where}`;
    }

    case WatchMode.Changes: {
      return `when the content of \`${observe.cssSelector ?? ''}\` changes`;
    }
  }
};

export const statusText = (observe: Observe): string => {
  if (!observe.active) {
    return observe.triggeredAtMS > 0 &&
      observe.lastResult === 'triggered'
      ? '⏸️ Inactive (change found)'
      : '⏸️ Inactive';
  }

  if (observe.consecutiveTimeouts > 0) {
    return `⚠️ Active, last ${observe.consecutiveTimeouts} check(s) failed`;
  }

  return '🟢 Active';
};

const lastResultText = (observe: Observe): string => {
  if (Number(observe.lastScrapeAtMS) === 0) {
    return 'not checked yet';
  }

  const when = discordTime(observe.lastScrapeAtMS, 'R');
  if (observe.lastError) {
    return `${when}: failed - ${truncate(observe.lastError, 120)}`;
  }

  return `${when}: ${observe.lastResult ?? 'ok'}`;
};

export const newObserveRow = (): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_NEW)
      .setLabel('New Observe')
      .setStyle(ButtonStyle.Primary)
  );

export const actionRow = (
  observe: Pick<Observe, 'id' | 'url' | 'active'>,
  options: { showStateButton?: boolean } = {}
): ActionRowBuilder<ButtonBuilder> => {
  const row = new ActionRowBuilder<ButtonBuilder>();
  // Link buttons are limited to 512 characters.
  if (observe.url.length <= 512) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Open page')
        .setStyle(ButtonStyle.Link)
        .setURL(observe.url)
    );
  }

  if (options.showStateButton ?? true) {
    row.addComponents(
      observe.active
        ? new ButtonBuilder()
            .setCustomId(`${BUTTON_PAUSE}${observe.id}`)
            .setLabel('Pause')
            .setStyle(ButtonStyle.Secondary)
        : new ButtonBuilder()
            .setCustomId(`${BUTTON_KEEP_WATCHING}${observe.id}`)
            .setLabel('Keep watching')
            .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_EDIT}${observe.id}`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_DELETE}${observe.id}`)
      .setLabel('Delete…')
      .setStyle(ButtonStyle.Danger)
  );
  return row;
};

const attachScreenshot = (
  embed: EmbedBuilder,
  screenshot: Buffer | undefined
): AttachmentBuilder[] => {
  if (!screenshot) {
    return [];
  }

  embed.setImage(`attachment://${SCREENSHOT_NAME}`);
  return [new AttachmentBuilder(screenshot, { name: SCREENSHOT_NAME })];
};

const setThumbnail = (embed: EmbedBuilder, thumbnail: string | null) => {
  if (thumbnail) {
    try {
      embed.setThumbnail(thumbnail);
    } catch {}
  }
};

export const buildObserveEmbed = (
  observe: Observe,
  options?: EmbedOptions
): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle(observe.name)
    .setURL(observe.url.length <= 2000 ? observe.url : null)
    .setColor(options?.color ?? 'DarkGreen')
    .setDescription(options?.description ?? `Notifies ${describeTarget(observe)}.`)
    .addFields(
      { name: 'Status', value: statusText(observe), inline: true },
      {
        name: 'Interval',
        value: ScrapeInterval.enumText(observe.scrapeInterval.type),
        inline: true,
      },
      { name: 'Mode', value: watchModeText(observe.watchMode), inline: true },
      { name: 'Notify via', value: notifyModeText(observe.notifyMode), inline: true },
      { name: 'Keep active', value: formatBool(observe.keepActive), inline: true },
      {
        name: 'Checks / failed',
        value: `${observe.amountScraped} / ${observe.timeouts}`,
        inline: true,
      },
      { name: 'Last check', value: lastResultText(observe) }
    );

  if (observe.active && Number(observe.nextScrapeAtMS) > 0) {
    embed.addFields({
      name: 'Next check',
      value: discordTime(observe.nextScrapeAtMS, 'R'),
      inline: true,
    });
  }

  if (observe.triggeredAtMS > 0) {
    embed.addFields({
      name: 'Last notified',
      value: discordTime(observe.triggeredAtMS, 'R'),
      inline: true,
    });
  }

  embed.addFields({ name: 'URL', value: truncate(observe.url, 1000) });
  setThumbnail(embed, observe.thumbnail);
  return embed;
};

export const buildTriggerNotification = (
  observe: Observe,
  result: ScrapeSuccess,
  previousText: string | null,
  deactivated: boolean
): MessagePayload => {
  const headline = {
    [WatchMode.Disappears]: `\`${observe.watchText}\` is gone from the page`,
    [WatchMode.Appears]: `\`${observe.watchText}\` just showed up on the page`,
    [WatchMode.Changes]: 'The watched content changed',
  }[observe.watchMode];

  const embed = new EmbedBuilder()
    .setTitle(`🔔 ${observe.name}`)
    .setURL(observe.url.length <= 2000 ? observe.url : null)
    .setColor('Gold')
    .setDescription(`${headline} - check quickly!`)
    .setTimestamp(new Date());

  if (observe.watchMode === WatchMode.Changes) {
    if (previousText) {
      embed.addFields({ name: 'Before', value: codeBlock(previousText) });
    }

    embed.addFields({ name: 'Now', value: codeBlock(result.text) });
  } else if (result.matchFound) {
    embed.addFields({
      name: 'On the page',
      value: truncate(snippet(result.text, observe.watchText), 1000),
    });
  }

  embed.addFields({
    name: 'What now',
    value: deactivated
      ? 'This Observe is now inactive. **Keep watching** re-arms it for the next change.'
      : 'This Observe stays active (keep-active) and notifies again on the next change.',
  });
  setThumbnail(embed, result.thumbnail ?? observe.thumbnail);
  const files = attachScreenshot(embed, result.screenshot);

  return {
    content: `A change was found for your Observe \`${observe.name}\`!`,
    embeds: [embed],
    files,
    components: [
      actionRow({ id: observe.id, url: observe.url, active: !deactivated }),
    ],
  };
};

export type FailureNotice = 'first' | 'cumulative' | 'deactivated';

export const buildFailureNotification = (
  observe: Observe,
  result: ScrapeError,
  notice: FailureNotice,
  settings: Settings
): MessagePayload => {
  const reason = failureText(result.failure, {
    cssSelector: observe.cssSelector,
    httpStatus: result.httpStatus,
  });

  const description = {
    first: `Checking \`${observe.name}\` failed: ${reason}. The bot keeps trying - after ${settings.consecutiveTimeoutsLimit} failed checks in a row it deactivates this Observe.`,
    cumulative: `\`${observe.name}\` has now failed ${settings.timeoutsTillNotify} checks in total (latest: ${reason}). A failed check means the page wasn't actually looked at, so a change could be missed. Check the page and the Observe - an admin can also raise the timeout with \`/settings set-timeout\`.`,
    deactivated: `\`${observe.name}\` failed ${settings.consecutiveTimeoutsLimit} checks in a row and has been deactivated. Latest: ${reason}. Fix it with \`/edit\` or press **Keep watching** to try again.`,
  }[notice];

  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${observe.name}`)
    .setURL(observe.url.length <= 2000 ? observe.url : null)
    .setColor(notice === 'deactivated' ? 'DarkRed' : 'Orange')
    .setDescription(description)
    .setTimestamp(new Date());
  setThumbnail(embed, observe.thumbnail);
  const files = attachScreenshot(embed, result.screenshot);

  const active = notice === 'deactivated' ? false : observe.active;
  return {
    embeds: [embed],
    files,
    components: [actionRow({ id: observe.id, url: observe.url, active })],
  };
};

// The reply for /preview, /observe, /edit and /scrape: what the bot saw.
export const buildScrapeReport = (
  target: {
    name?: string;
    url: string;
    watchText: string;
    watchMode: WatchMode;
    cssSelector: string | null;
  },
  result: ScrapeResult,
  verdict: { title: string; text: string; color: ColorResolvable }
): MessagePayload => {
  const embed = new EmbedBuilder()
    .setTitle(verdict.title)
    .setColor(verdict.color)
    .setDescription(verdict.text)
    .addFields(
      { name: 'Watches', value: truncate(describeTarget(target), 1000) },
      { name: 'Page title', value: truncate(result.title || '-', 200), inline: true },
      {
        name: 'HTTP',
        value: result.httpStatus === null ? '-' : String(result.httpStatus),
        inline: true,
      },
      { name: 'Took', value: prettyDuration(result.durationMS), inline: true }
    );

  if (result.ok) {
    embed.addFields({
      name:
        target.watchMode === WatchMode.Changes
          ? 'Content'
          : result.matchFound
            ? 'Found it here'
            : 'Start of the visible text',
      value: codeBlock(
        snippet(
          result.text,
          target.watchMode === WatchMode.Changes ? undefined : target.watchText
        ) || '(no visible text)'
      ),
    });
    setThumbnail(embed, result.thumbnail);
  } else {
    embed.addFields({ name: 'Detail', value: truncate(result.detail, 1000) });
  }

  if (result.finalUrl !== target.url) {
    embed.addFields({ name: 'Ended up at', value: truncate(result.finalUrl, 1000) });
  }

  const files = attachScreenshot(embed, result.screenshot);
  return { embeds: [embed], files };
};

export const buildSettingsEmbed = (settings: Settings): EmbedBuilder => {
  const lastUpdated = Number(settings.updatedAtMS);
  return new EmbedBuilder()
    .setTitle('Settings')
    .setColor('DarkBlue')
    .setDescription('The following settings are currently active for this server:')
    .setFields([
      { name: 'Guild Observe limit', value: `${settings.guildObserveLimit}` },
      { name: 'User Observe limit', value: `${settings.userObserveLimit}` },
      {
        name: 'Failed checks in a row until an Observe is deactivated',
        value: `${settings.consecutiveTimeoutsLimit}`,
      },
      { name: 'Page load timeout', value: `${settings.timeout} seconds` },
      {
        name: 'Notify users of a first failed check',
        value: formatBool(settings.notifyOnFirstTimeout),
      },
      {
        name: 'Failed checks in total until users get notified',
        value: `${settings.timeoutsTillNotify}`,
      },
      {
        name: 'Notification channel',
        value: settings.notifyChannelId
          ? `<#${settings.notifyChannelId}>`
          : 'the channel each Observe was created in',
      },
    ])
    .setFooter({
      text: `last updated: ${
        lastUpdated === 0 ? '-' : new Date(lastUpdated).toISOString()
      }`,
    });
};

export const buildCommandResultEmbed = (
  commandResult: CommandResult
): EmbedBuilder =>
  new EmbedBuilder()
    .setTitle(commandResult.successful ? 'Success' : 'Error')
    .setColor(commandResult.successful ? 'DarkGreen' : 'DarkRed')
    .setDescription(commandResult.message ?? 'Command was successful!');

export const buildObserveListEmbed = (
  observes: Observe[],
  activeOnly: boolean,
  compact: boolean
): EmbedBuilder => {
  const message = new EmbedBuilder();
  const embedObserves = activeOnly
    ? observes.filter((observe) => observe.active)
    : [...observes].sort((a, b) => Number(b.active) - Number(a.active));
  const adjective = activeOnly ? 'active ' : '';

  message.setTitle(`Your ${adjective}Observes`).setColor('DarkBlue');

  if (embedObserves.length === 0) {
    message.setDescription(
      `You don't have any ${adjective}Observes. Create one with \`/observe\`${
        activeOnly && observes.length > 0
          ? ', or bring back an inactive one with `/reactivate`'
          : ''
      }!`
    );
    return message;
  }

  const columns: Column[] = [
    { name: 'Name', value: (observe) => observe.name },
    { name: 'Status', value: (observe) => statusText(observe) },
    {
      name: 'Last check',
      value: (observe) =>
        Number(observe.lastScrapeAtMS) > 0
          ? discordTime(observe.lastScrapeAtMS, 'R')
          : '-',
    },
  ];

  if (!compact) {
    columns.push(
      { name: 'Mode', value: (observe) => watchModeText(observe.watchMode) },
      {
        name: 'Interval',
        value: (observe) => ScrapeInterval.enumText(observe.scrapeInterval.type),
      },
      { name: 'URL', value: (observe) => truncate(observe.url, 60) }
    );
  }

  return message.setFields(buildColumnFields(embedObserves, columns)).setFooter({
    text: `${embedObserves.length} ${adjective}Observes - /list name:<name> shows one in detail`,
  });
};

export const buildHistoryEmbed = (
  observe: Observe,
  logs: ScrapeLog[]
): EmbedBuilder => {
  const embed = new EmbedBuilder()
    .setTitle(`History: ${observe.name}`)
    .setColor('DarkBlue');

  if (logs.length === 0) {
    return embed.setDescription('No checks recorded yet.');
  }

  const lines = logs.map((log) => {
    const status = log.httpStatus === null ? '' : ` · HTTP ${log.httpStatus}`;
    const detail = log.detail ? ` · ${truncate(log.detail, 70)}` : '';
    return `${discordTime(log.atMS, 'f')} **${log.outcome}**${status} · ${prettyDuration(log.durationMS)}${detail}`;
  });

  // Description is limited to 4096 characters.
  let description = '';
  for (const line of lines) {
    if (description.length + line.length + 1 > 4000) {
      break;
    }

    description += `${line}\n`;
  }

  return embed
    .setDescription(description)
    .setFooter({ text: `Newest first · the last ${logs.length} checks` });
};

export const buildObserveOverview = async (
  observes: Observe[],
  activeOnly: boolean,
  client: Client
): Promise<EmbedBuilder> => {
  const uniqueUserIds = [...new Set(observes.map((observe) => observe.userId))];
  const users = await Promise.all(
    uniqueUserIds.map(async (userId) =>
      client.users.fetch(userId).catch(() => undefined)
    )
  );
  const userIdNameMap = new Map(
    uniqueUserIds.map((userId, index) => [
      userId,
      users[index]?.displayName ?? userId,
    ])
  );

  const sorted = [...observes].sort(
    (ob1, ob2) =>
      Number(ob2.active) - Number(ob1.active) ||
      userIdNameMap
        .get(ob1.userId)!
        .localeCompare(userIdNameMap.get(ob2.userId)!)
  );
  const adjective = activeOnly ? 'active ' : '';

  return new EmbedBuilder()
    .setTitle('Observes Overview')
    .setColor('DarkGreen')
    .setDescription(`All ${adjective}Observes managed by this bot`)
    .addFields(
      buildColumnFields(sorted, [
        { name: 'User', value: (observe) => userIdNameMap.get(observe.userId)! },
        { name: 'Name', value: (observe) => observe.name },
        { name: 'Status', value: (observe) => statusText(observe) },
        { name: 'Checks', value: (observe) => `${observe.amountScraped}` },
        {
          name: 'Created',
          value: (observe) => discordTime(observe.createdAtMS, 'd'),
        },
      ])
    )
    .setFooter({
      text: `${observes.length} ${adjective}Observes, ${uniqueUserIds.length} users`,
    });
};

const codeBlock = (text: string): string =>
  `\`\`\`\n${truncate(text.replace(/`/g, 'ˋ').trim() || ' ', 990)}\n\`\`\``;

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
