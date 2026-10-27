import { AutocompleteInteraction } from 'discord.js';
import ObserveManager from '../managers/observe.js';
import { Observe } from '../types/models/observe.js';

// Discord accepts at most 25 choices of at most 100 characters each, and
// rejects the whole response otherwise - which used to break autocomplete
// for anyone with more than 25 Observes.
export const MAX_CHOICES = 25;
export const MAX_CHOICE_LENGTH = 100;

export const toChoices = (values: string[]) =>
  values
    .filter((value) => value.length > 0 && value.length <= MAX_CHOICE_LENGTH)
    .slice(0, MAX_CHOICES)
    .map((value) => ({ name: value, value }));

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
  const names = observes
    .map((observe) => observe.name)
    .filter((name) => name.toLocaleLowerCase().includes(userText))
    .sort((a, b) => a.localeCompare(b));

  await interaction.respond(toChoices(names));
};

export default respondWithObserveNames;
