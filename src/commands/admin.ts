import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import { readPackageSync } from 'read-pkg';
import ObserveManager from '../managers/observe.js';
import SchedulerManager from '../managers/scheduler.js';
import BrowserService from '../services/browser.js';
import { TYPES } from '../types.js';
import { buildObserveOverview } from '../utils/build-embed.js';
import { truncate } from '../utils/string.js';
import { discordTime, prettyDuration } from '../utils/time.js';
import Command from './command.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list-observes')
        .setDescription('Get all Observes managed by this bot')
        .addBooleanOption((option) =>
          option
            .setName('this-guild')
            .setDescription(
              'If you want to only list the Observes in this guild, true by default'
            )
        )
        .addBooleanOption((option) =>
          option
            .setName('active-only')
            .setDescription(
              'If you want to only list the Observes which are active, true by default'
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Health of the bot: browser, scheduler, recent checks')
    );

  private readonly version = readPackageSync().version;

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Managers.Scheduler)
    private readonly scheduler: SchedulerManager,
    @inject(TYPES.Services.Browser)
    private readonly browserService: BrowserService,
    @inject(TYPES.Client)
    private readonly client: Client
  ) {}

  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'list-observes': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // `getBoolean` returns `null` when the user left the option empty,
        // which must fall back to each option's documented default (true)
        // rather than to "unfiltered" - otherwise an admin running this with
        // no arguments would see every guild's Observes (including inactive
        // ones), not just their own guild's active ones as advertised.
        const thisGuild = interaction.options.getBoolean('this-guild') ?? true;
        const activeOnly =
          interaction.options.getBoolean('active-only') ?? true;

        const observes = await this.observeManager.getObserves({
          guildId: thisGuild ? interaction.guildId! : undefined,
          active: activeOnly ? true : undefined,
        });

        const embed = await buildObserveOverview(
          observes,
          activeOnly,
          this.client
        );

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case 'status': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({ embeds: [await this.statusEmbed(interaction.guildId!)] });
        break;
      }

      default:
        throw new Error('Unknown subcommand!');
    }
  }

  private async statusEmbed(guildId: string): Promise<EmbedBuilder> {
    const browser = this.browserService.status();
    // Observe numbers stay within this server; process health is global.
    const stats = await this.observeManager.getStats(Date.now() - DAY_MS, [guildId]);
    const { lastTick } = this.scheduler;

    const outcomes =
      stats.outcomes
        .sort((a, b) => b._count._all - a._count._all)
        .map(
          (row) =>
            `${row.outcome}: ${row._count._all} (avg ${prettyDuration(row._avg.durationMS ?? 0)})`
        )
        .join('\n') || 'no checks in the last 24 hours';

    const failing =
      stats.failing
        .slice(0, 10)
        .map(
          (observe) =>
            `\`${observe.name}\` (<@${observe.userId}>): ${observe.consecutiveTimeouts}× - ${truncate(observe.lastError ?? '?', 80)}`
        )
        .join('\n') || 'none';

    return new EmbedBuilder()
      .setTitle('Bot status')
      .setColor(browser.lastLaunchError ? 'Orange' : 'DarkGreen')
      .addFields(
        { name: 'Version', value: this.version, inline: true },
        {
          name: 'Up since',
          value: discordTime(this.scheduler.startedAtMS, 'R'),
          inline: true,
        },
        { name: 'Discord latency', value: `${this.client.ws.ping} ms`, inline: true },
        {
          name: 'Scheduler',
          value: lastTick ? `last run ${discordTime(lastTick, 'R')}` : 'not run yet',
          inline: true,
        },
        {
          name: 'Browser',
          value: [
            browser.connected ? '🟢 running' : '⚪ not running (starts on demand)',
            browser.launchedAtMS
              ? `started ${discordTime(browser.launchedAtMS, 'R')}`
              : undefined,
            `${browser.active} checking, ${browser.queued} queued`,
            `${browser.pagesSinceLaunch} pages since start, ${browser.totalPages} total`,
            browser.lastLaunchError
              ? `last launch error: ${truncate(browser.lastLaunchError, 200)}`
              : undefined,
          ]
            .filter(Boolean)
            .join('\n'),
          inline: true,
        },
        {
          name: 'Observes on this server',
          value: `${stats.active} active / ${stats.total} total`,
          inline: true,
        },
        { name: 'Checks in the last 24h', value: truncate(outcomes, 1000) },
        { name: 'Currently failing', value: truncate(failing, 1000) }
      )
      .setTimestamp(new Date());
  }
}
