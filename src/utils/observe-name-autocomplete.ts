import { AutocompleteInteraction } from 'discord.js';
import ObserveManager from '../managers/observe.js';
import { Observe } from '../types/models/observe.js';

// Shared by every command whose autocomplete is just "suggest this user's
// Observe names, optionally pre-filtered (e.g. inactive-only), narrowed by
// whatever they've typed so far".
const respondWithObserveNames = async (
  interaction: AutocompleteInteraction,
  observeManager: ObserveManager,
  options: { filter?: (observe: Observe) => boolean } = {}
): Promise<void> => {
  let observes = await observeManager.getObserves({
    guildId: interaction.guildId!,
    userId: interaction.user.id,
  });

  if (options.filter) {
    observes = observes.filter(options.filter);
  }

  const userText = interaction.options.getFocused().trim().toLocaleLowerCase();

  if (userText.length > 0) {
    observes = observes.filter((observe) =>
      observe.name.trim().toLocaleLowerCase().includes(userText)
    );
  }

  await interaction.respond(
    observes.map((observe) => ({ name: observe.name, value: observe.name }))
  );
};

export default respondWithObserveNames;
