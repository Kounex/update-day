import { EmbedBuilder } from 'discord.js';
import { CommandResult } from '../types/interfaces/command-result';
import { Observe, ScrapeInterval } from '../types/models/observe';

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

export const buildObserveListEmbed = (
  observes: Observe[],
  active: boolean,
  compact: boolean
): EmbedBuilder => {
  const message = new EmbedBuilder();
  const embedObserves = active
    ? observes.filter((observe) => observe.active)
    : observes.sort((a, b) => Number(a.active) - Number(b.active));

  message
    .setTitle(`Your ${active ? 'active' : ''} Observes`)
    .setColor('DarkBlue')
    .setDescription(
      embedObserves.length < 1
        ? `You don't have any ${
            active ? 'active' : ''
          } Observes. Create a new Observe with \`/observe\`${
            observes.length < 0
              ? ' or change the active state of one of your existing observes with `/edit`'
              : ''
          }!`
        : null
    );

  if (embedObserves.length > 0) {
    const fields = observeFields(embedObserves, compact);

    message.setFields(fields).setFooter({
      text: `${embedObserves.length} ${active ? 'active' : ''} Observes`,
    });
  }

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
    .addFields(observeFields([observe], false));
  // .setFooter({ text: `URL: ${observe.url}` });

  const pathArray = observe.url.split('/');
  const protocol = pathArray[0];
  const host = pathArray[2];

  const favicon = `${protocol}//${host}/favicon.png`;

  // message.setThumbnail(favicon);

  return message;
};

function observeFields(observes: Observe[], compact: boolean = false) {
  const fields = [
    {
      name: 'observes',
      value: observes.reduce((sum, observe) => `${sum}${observe.name}\n`, ''),
      inline: true,
    },
    {
      name: 'URL',
      value: observes.reduce((sum, observe) => `${sum}${observe.url}\n`, ''),
      inline: true,
    },
    {
      name: 'Scrape Interval',
      value: observes.reduce(
        (sum, observe) =>
          `${sum}${ScrapeInterval.enumText(observe.scrapeInterval.type)}\n`,
        ''
      ),
      inline: true,
    },
  ];

  if (!compact) {
    fields.push(
      {
        name: 'CSS-Selector',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.cssSelector}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Current Text',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.currentText}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'DOM Element Property',
        value: observes.reduce(
          (sum, observe) =>
            `${sum}${observe.domElementProperty ?? 'innerText (default)'}\n`,
          ''
        ),
        inline: true,
      },
      {
        name: 'Keep Active',
        value: observes.reduce(
          (sum, observe) => `${sum}${observe.keepActive ? 'Yes' : 'No'}\n`,
          ''
        ),
        inline: true,
      }
    );
  }

  return fields;
}
