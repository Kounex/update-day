import { Client } from 'discord.js';
import { promises as fs } from 'fs';
import { inject, injectable } from 'inversify';
import Config from '../config.js';
import { TYPES } from '../types.js';
import logger from '../utils/logger.js';
import ObserveManager from './observe.js';

const TICK_MS = 15_000;
// Exit (and let the container's restart policy start a fresh process) when
// the bot is clearly wedged rather than limp along silently.
const DISCONNECTED_EXIT_MS = 10 * 60 * 1000;
const STUCK_TICK_EXIT_MS = 5 * 60 * 1000;

@injectable()
export default class SchedulerManager {
  public readonly startedAtMS = Date.now();
  private timer?: NodeJS.Timeout;
  private tickStartedAtMS: number | null = null;
  private lastTickAtMS: number | null = null;
  private disconnectedSinceMS: number | null = null;
  private stopping = false;

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Config) private readonly config: Config
  ) {}

  public get lastTick(): number | null {
    return this.lastTickAtMS;
  }

  public init(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
  }

  public stop(): void {
    this.stopping = true;
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.stopping) {
      return;
    }

    if (this.tickStartedAtMS !== null) {
      if (Date.now() - this.tickStartedAtMS > STUCK_TICK_EXIT_MS) {
        logger.error('Scheduler tick has been stuck for 5 minutes, exiting so the container restarts');
        process.exit(1);
      }

      return;
    }

    this.tickStartedAtMS = Date.now();
    try {
      this.watchConnection();
      await this.scheduleDueObserves();
      await this.writeHeartbeat();
      this.lastTickAtMS = Date.now();
    } catch (error: unknown) {
      logger.error('Scheduler tick failed', error);
    } finally {
      this.tickStartedAtMS = null;
    }
  }

  private async scheduleDueObserves(): Promise<void> {
    const allowed = this.config.ALLOWED_GUILD_IDS;
    const due = await this.observeManager.getObserves({
      active: true,
      dueBy: Date.now(),
      guildIds: allowed.length > 0 ? allowed : undefined,
    });

    for (const observe of due) {
      if (this.observeManager.isBusy(observe)) {
        continue;
      }

      // Fire and forget: the browser service queues these (bounded by
      // SCRAPE_CONCURRENCY), and processObserve marks the Observe busy right
      // away so the next tick doesn't start it again. Never let a rejection
      // go unhandled - that would crash the whole process.
      this.observeManager.processObserve(observe).catch((error: unknown) => {
        logger.error(`Checking Observe ${observe.id} (${observe.name}) failed`, error);
      });
    }
  }

  private watchConnection(): void {
    if (this.client.isReady()) {
      this.disconnectedSinceMS = null;
      return;
    }

    this.disconnectedSinceMS ??= Date.now();
    if (Date.now() - this.disconnectedSinceMS > DISCONNECTED_EXIT_MS) {
      logger.error('Not connected to Discord for 10 minutes, exiting so the container restarts');
      process.exit(1);
    }
  }

  // Read by the container's HEALTHCHECK: only fresh while ticks complete
  // *and* the Discord connection is up.
  private async writeHeartbeat(): Promise<void> {
    if (!this.client.isReady()) {
      return;
    }

    try {
      await fs.writeFile(this.config.HEARTBEAT_FILE, String(Date.now()));
    } catch (error: unknown) {
      logger.debug(error);
    }
  }
}
