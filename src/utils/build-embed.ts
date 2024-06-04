import { EmbedBuilder } from 'discord.js';
import { CommandResult } from '../types/interfaces/command-result';
import { Observe } from '../types/models/observe';

export const buildCommandResultEmbed = (
  commandResult: CommandResult
): EmbedBuilder => {
  const message = new EmbedBuilder();

  message
    .setTitle(commandResult.successful ? 'Success' : 'Error')
    .setColor(commandResult.successful ? 'DarkGreen' : 'DarkRed')
    .setDescription(commandResult.message ?? 'Command was successful!');

  return message;
};

export const buildObserveEmbed = (
  observe: Observe,
  description?: string
): EmbedBuilder => {
  const message = new EmbedBuilder();

  message
    .setTitle(observe.name)
    .setColor('DarkGreen')
    .setDescription(description ?? observe.url)
    .addFields([
      {
        name: 'CSS-Selector',
        value: observe.cssSelector,
        inline: true,
      },
      { name: '　', value: '　', inline: true },
      {
        name: 'Current Text',
        value: observe.currentText,
        inline: true,
      },
      {
        name: 'DOM Element Property',
        value: observe.domElementProperty ?? 'innerText',
      },
    ]);
  // .setFooter({ text: `URL: ${observe.url}` });

  const pathArray = observe.url.split('/');
  const protocol = pathArray[0];
  const host = pathArray[2];

  const favicon = `${protocol}//${host}/favicon.png`;

  // message.setThumbnail(favicon);

  return message;
};
