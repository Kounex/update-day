import { EmbedBuilder } from 'discord.js';
import { CommandResult } from '../types/interfaces/command-result';
import { Observe } from '../types/models/observe';

export const buildCommandResultEmbed = (
  commandResult: CommandResult
): EmbedBuilder => {
  const message = new EmbedBuilder();

  message
    .setTitle(commandResult.successful ? 'Success!' : 'Error!')
    .setColor(commandResult.successful ? 'DarkGreen' : 'DarkRed')
    .setDescription(commandResult.message ?? 'Command was successful!');

  return message;
};

export const buildObserveEmbed = (observe: Observe): EmbedBuilder => {
  const message = new EmbedBuilder();

  message
    .setTitle(observe.name)
    .setColor('DarkGreen')
    // .setDescription(description)
    .addFields([
      { name: 'CSS-Selector', value: observe.cssSelector, inline: true },
      {
        name: 'Current Text',
        value: observe.currentText,
        inline: true,
      },
      {
        name: 'DOM Element Property',
        value: observe.domElementProperty ?? 'innerText',
        inline: true,
      },
    ])
    .setFooter({ text: `URL: ${observe.url}` });

  // if (thumbnailUrl) {
  //   message.setThumbnail(thumbnailUrl);
  // }

  return message;
};
