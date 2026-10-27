import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ColorResolvable,
  MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager, { CheckOutcome } from '../managers/observe.js';
import { TYPES } from '../types.js';
import { failureText } from '../types/classes/scrape-result.js';
import {
  actionRow,
  buildCommandResultEmbed,
  buildObserveEmbed,
  buildScrapeReport,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Check one of your Observes right now')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to check')
        .setAutocomplete(true)
        .setRequired(true)
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;
    const observe = await this.observeManager.findByName(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    if (!observe) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `You don't have an Observe called \`${name}\` - check \`/list\`.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Same pipeline as the background checks (history, failure counting,
    // confirmation, (de)activation) - minus the DM, since the result is
    // shown right here.
    const { outcome, scrapeResult, observe: updated } =
      await this.observeManager.processObserve(observe, { notify: false });

    if (outcome === 'busy' || !scrapeResult) {
      await interaction.editReply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `\`${observe.name}\` is being checked right now - try again in a moment.`,
          }),
        ],
      });
      return;
    }

    const verdicts: Record<
      Exclude<CheckOutcome, 'busy'>,
      { title: string; text: string; color: ColorResolvable }
    > = {
      triggered: {
        title: '🔔 Change found',
        text: updated.active
          ? 'Confirmed by a second load. This Observe stays active (keep-active).'
          : 'Confirmed by a second load. This Observe is now inactive - **Keep watching** re-arms it for the next change.',
        color: 'Gold',
      },
      unchanged: {
        title: 'No change',
        text: updated.active
          ? 'Nothing to report - checking continues in the background.'
          : 'Nothing to report. This Observe is inactive, so it is not checked in the background.',
        color: 'DarkGreen',
      },
      unconfirmed: {
        title: 'Change not confirmed',
        text: 'The first load looked like a change, but a second load a moment later did not - most likely a glitch. Nothing changed.',
        color: 'Orange',
      },
      undelivered: {
        title: '🔔 Change found',
        text: 'Change confirmed.',
        color: 'Gold',
      },
      failed: {
        title: 'Check failed',
        text: scrapeResult.ok
          ? ''
          : `${failureText(scrapeResult.failure, {
              cssSelector: observe.cssSelector,
              httpStatus: scrapeResult.httpStatus,
            })}. This counts as a failed check (${updated.consecutiveTimeouts} in a row).`,
        color: 'Orange',
      },
    };

    const report = buildScrapeReport(observe, scrapeResult, verdicts[outcome]);
    await interaction.editReply({
      embeds: [...report.embeds, buildObserveEmbed(updated)],
      files: report.files,
      components: [actionRow(updated)],
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager);
  }
}
