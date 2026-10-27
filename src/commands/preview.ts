import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { failureText } from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';
import {
  buildCommandResultEmbed,
  buildScrapeReport,
} from '../utils/build-embed.js';
import Command from './command.js';
import {
 modeOption, selectorOption, textOption, urlOption,
} from './options.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('preview')
    .setDescription('Try out an Observe: see what the bot sees on a page, without saving anything')
    .addStringOption((option) =>
      urlOption(option).setName('url').setDescription('Page to look at').setRequired(true)
    )
    .addStringOption((option) =>
      textOption(option).setName('text').setDescription('Text to look for')
    )
    .addStringOption((option) =>
      modeOption(option).setDescription('What would count as a change - "Text disappears" by default')
    )
    .addStringOption((option) =>
      selectorOption(option)
        .setName('css-selector')
        .setDescription('Only look inside this part of the page')
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const candidate = Observe.create({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      name: 'preview',
      url: interaction.options.getString('url')!,
      watchText: interaction.options.getString('text'),
      watchMode: interaction.options.getString('mode'),
      cssSelector: interaction.options.getString('css-selector'),
    });

    if (!(candidate instanceof Observe)) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({ successful: false, message: candidate.message }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.observeManager.preview(candidate.guildId, {
      url: candidate.url,
      cssSelector: candidate.cssSelector,
      watchText: candidate.watchText,
      watchMode: candidate.watchMode,
    });

    let verdict;
    if (result.ok) {
      const validation = this.observeManager.validate(candidate, result);
      verdict = validation.successful
        ? {
            title: '✅ This works as an Observe',
            text: 'Create it with `/observe` and the same options.',
            color: 'DarkGreen' as const,
          }
        : {
            title: '⚠️ The page loads, but this would not work yet',
            text: validation.message!,
            color: 'Orange' as const,
          };
    } else {
      verdict = {
        title: '❌ Could not check the page',
        text: `${failureText(result.failure, {
          cssSelector: candidate.cssSelector,
          httpStatus: result.httpStatus,
        })}.`,
        color: 'DarkRed' as const,
      };
    }

    await interaction.editReply(buildScrapeReport(candidate, result, verdict));
  }
}
