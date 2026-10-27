import { Client, EmbedBuilder } from 'discord.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types.js';
import { NotifyMode, Observe } from '../types/models/observe.js';
import { MessagePayload } from '../utils/build-embed.js';
import logger from '../utils/logger.js';
import SettingsService from './settings.js';

// Delivers a message to an Observe's owner the way they asked for (DM,
// channel or both). A DM that fails - closed DMs, the user left every shared
// server - falls back to the channel with a mention, instead of the old
// behavior of losing the one notification that mattered.
@injectable()
export default class NotifierService {
  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  // True if the message reached the user in at least one way.
  public async notify(
    observe: Observe,
    payload: MessagePayload
  ): Promise<boolean> {
    const wantsDM =
      observe.notifyMode === NotifyMode.DM ||
      observe.notifyMode === NotifyMode.Both;
    const wantsChannel =
      observe.notifyMode === NotifyMode.Channel ||
      observe.notifyMode === NotifyMode.Both;

    let delivered = false;
    let dmFailed = false;

    if (wantsDM) {
      try {
        const user = await this.client.users.fetch(observe.userId);
        await this.sendWithFallback(async (message) => user.send(message), payload);
        delivered = true;
      } catch (error: unknown) {
        dmFailed = true;
        logger.warn(
          `Could not DM user ${observe.userId} about Observe ${observe.id}, trying the channel`,
          error
        );
      }
    }

    if (wantsChannel || dmFailed) {
      delivered = (await this.sendToChannel(observe, payload)) || delivered;
    }

    if (!delivered) {
      logger.error(
        `Could not deliver a notification for Observe ${observe.id} (${observe.name}) in any way - will retry`
      );
    }

    return delivered;
  }

  private async sendToChannel(
    observe: Observe,
    payload: MessagePayload
  ): Promise<boolean> {
    const settings = await this.settingsService.getSettings(observe.guildId);
    const channelId = settings.notifyChannelId ?? observe.channelId;
    if (!channelId) {
      logger.warn(`Observe ${observe.id} has no channel to notify in`);
      return false;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isSendable()) {
        logger.warn(`Channel ${channelId} is gone or not a text channel`);
        return false;
      }

      await this.sendWithFallback(
        async (message) =>
          channel.send({
            ...message,
            content: `<@${observe.userId}> ${message.content ?? ''}`.trim(),
            allowedMentions: { users: [observe.userId] },
          }),
        payload
      );
      return true;
    } catch (error: unknown) {
      logger.warn(`Could not post to channel ${channelId}`, error);
      return false;
    }
  }

  // A channel may not allow attachments - better the text without the
  // screenshot than nothing at all.
  private async sendWithFallback(
    send: (message: MessagePayload) => Promise<unknown>,
    payload: MessagePayload
  ): Promise<void> {
    try {
      await send(payload);
    } catch (error: unknown) {
      if (!payload.files?.length) {
        throw error;
      }

      logger.warn('Sending with screenshot failed, retrying without', error);
      await send({
        ...payload,
        files: [],
        embeds: payload.embeds.map((embed) =>
          EmbedBuilder.from(embed.toJSON()).setImage(null)
        ),
      });
    }
  }
}
