import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import ScrapeService from '../services/scrape.js';
import { TYPES } from '../types.js';
import { ScrapeResultType } from '../types/classes/scrape-result.js';
import {
  EmbedOptions,
  buildCommandResultEmbed,
  buildObserveEmbed,
} from '../utils/build-embed.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Manually trigger to scrape on of your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your observe to scrape')
        .setAutocomplete(true)
        .setRequired(true)
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;

    const observes = await this.observeManager.getObserves(
      interaction.guildId!,
      interaction.user.id
    );

    const observe = observes.find((userObserve) => userObserve.name == name);

    if (!!observe) {
      interaction.deferReply({ ephemeral: true });

      const scrapeResult = await this.scrapeService.observe(observe);

      var content: string;
      var options: EmbedOptions = { color: 'DarkGreen' };
      switch (scrapeResult.type) {
        case ScrapeResultType.Change: {
          content =
            'A change has been found for your following observe - check quickly!';
        }
        case ScrapeResultType.NoChange: {
          content =
            'No change - we still found the text you provided. If this Observe is still active, we will continue to observe in the background for you!';
          break;
        }
        case ScrapeResultType.Timeout: {
          content =
            'While scraping your Observe, we ran into a timeout. Check if the page itself still works and adjust if necessary!';
          options = { color: 'Orange' };
          break;
        }
        default: {
          content = `Scraping returned \`${
            ScrapeResultType[scrapeResult.type]
          }\` which is not handled by the bot. Check Observe and adjust if necessary!`;
          options = { color: 'Orange' };
          break;
        }
      }

      await interaction.followUp({
        content: content!,
        embeds: [buildObserveEmbed(observe, options!)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `Couldn't find an Observe of yours with the name ${name}. Make use of the autocorrect feature of this command or double check with \`/list\`!`,
          }),
        ],
        ephemeral: true,
      });
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    var observes = await this.observeManager.getObserves(
      interaction.guildId!,
      interaction.user.id
    );

    const userText = interaction.options.getFocused();

    if (userText.trim().length > 0) {
      observes = observes.filter((observe) =>
        observe.name
          .toLocaleLowerCase()
          .trim()
          .includes(userText.toLocaleLowerCase().trim())
      );
    }

    await interaction.respond(
      observes.map((observe) => ({ name: observe.name, value: observe.name }))
    );
  }
}
