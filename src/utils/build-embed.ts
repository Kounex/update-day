import { EmbedBuilder } from 'discord.js';
import { Observe } from '../types/models/observe';

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
