import { ButtonInteraction, MessageFlags } from 'discord.js';
import ObserveManager from '../managers/observe.js';
import { Observe } from '../types/models/observe.js';

// Buttons carry the Observe's id after their prefix (`obs:pause:42`). They
// also show up in DMs, where there's no guild to scope by - so look the
// Observe up by id and make sure it belongs to whoever pressed the button.
export const ownedObserveFromButton = async (
  interaction: ButtonInteraction,
  prefix: string,
  observeManager: ObserveManager
): Promise<Observe | undefined> => {
  const id = Number(interaction.customId.slice(prefix.length));
  const observe = Number.isInteger(id)
    ? await observeManager.getObserve(id)
    : undefined;

  if (!observe || observe.userId !== interaction.user.id) {
    await interaction.reply({
      content: observe
        ? 'This isn\'t your Observe.'
        : 'This Observe doesn\'t exist anymore.',
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }

  return observe;
};
