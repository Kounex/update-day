import { Prisma, ScrapeLog } from '@prisma/client';
import { inject, injectable } from 'inversify';
import NotifierService from '../services/notifier.js';
import ScrapeService, { ScrapeTarget } from '../services/scrape.js';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import {
  ScrapeError,
  ScrapeResult,
  ScrapeSuccess,
  failureText,
} from '../types/classes/scrape-result.js';
import { CommandResult } from '../types/interfaces/command-result.js';
import {
  Observe,
  ObserveInput,
  WatchMode,
} from '../types/models/observe.js';
import {
  buildFailureNotification,
  buildTriggerNotification,
  FailureNotice,
} from '../utils/build-embed.js';
import { prisma } from '../utils/db.js';
import {
 evaluate, hashText, normalizeText, validateBaseline,
} from '../utils/evaluate.js';
import logger from '../utils/logger.js';
import { truncate } from '../utils/string.js';

// A suspected change is only reported if a fresh page load a little later
// agrees - one bad load (half-rendered page, flaky CDN, A/B test) used to be
// enough to send "check quickly!" and switch the Observe off.
const CONFIRM_DELAY_MS = Number(process.env.CONFIRM_DELAY_MS ?? 20_000);
const MANUAL_CONFIRM_DELAY_MS = 3_000;
// Undelivered notifications are retried sooner than a long interval would.
const UNDELIVERED_RETRY_MS = 15 * 60 * 1000;
// Same for a suspected change whose confirmation load failed.
const CONFIRM_RETRY_MS = 5 * 60 * 1000;
const HISTORY_SIZE = 50;
const MAX_STORED_TEXT = 1000;

export type CheckOutcome =
  | 'busy'
  | 'failed'
  | 'unchanged'
  | 'unconfirmed'
  | 'undelivered'
  | 'triggered';

export interface CheckResult {
  outcome: CheckOutcome;
  scrapeResult?: ScrapeResult;
  observe: Observe;
}

export interface ValidationResult extends CommandResult {
  scrapeResult?: ScrapeResult;
}

const targetOf = (observe: Observe): ScrapeTarget => ({
  url: observe.url,
  cssSelector: observe.cssSelector,
  watchText: observe.watchText,
  watchMode: observe.watchMode,
});

const sleep = async (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

@injectable()
export default class ObserveManager {
  // Observes currently being checked - by the scheduler or a manual /scrape -
  // so the same one is never processed twice at once.
  private readonly inFlight = new Set<number>();

  constructor(
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService,
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService,
    @inject(TYPES.Services.Notifier)
    private readonly notifier: Pick<NotifierService, 'notify'>
  ) {}

  public isBusy(observe: Observe): boolean {
    return this.inFlight.has(observe.id);
  }

  public async getObserves(options: {
    guildId?: string;
    guildIds?: string[];
    userId?: string;
    name?: string;
    active?: boolean;
    dueBy?: number;
  }): Promise<Observe[]> {
    return (
      await prisma.observe.findMany({
        where: {
          guildId: options.guildIds ? { in: options.guildIds } : options.guildId,
          userId: options.userId,
          name: options.name,
          active: options.active,
          nextScrapeAtMS:
            options.dueBy === undefined ? undefined : { lte: options.dueBy },
        },
        orderBy: [{ nextScrapeAtMS: 'asc' }, { id: 'asc' }],
      })
    ).map((observe) => Observe.fromPrisma(observe));
  }

  public async getObserve(id: number): Promise<Observe | undefined> {
    const observe = await prisma.observe.findUnique({ where: { id } });
    return observe ? Observe.fromPrisma(observe) : undefined;
  }

  public async findByName(
    guildId: string,
    userId: string,
    name: string
  ): Promise<Observe | undefined> {
    const observe = await prisma.observe.findUnique({
      where: { guildId_userId_name: { guildId, userId, name } },
    });
    return observe ? Observe.fromPrisma(observe) : undefined;
  }

  // Scrape a target without saving anything - /preview, and the validation
  // step of /observe and /edit.
  public async preview(
    guildId: string,
    target: ScrapeTarget
  ): Promise<ScrapeResult> {
    const settings = await this.settingsService.getSettings(guildId);
    return this.scrapeService.scrape(target, {
      timeoutMS: settings.timeout * 1000,
      screenshot: true,
    });
  }

  public async addObserve(
    observe: Observe,
    // A fresh check of this exact target (the form's preview) - reused
    // instead of loading the page again.
    options: { scrapeResult?: ScrapeResult } = {}
  ): Promise<ValidationResult> {
    const limitProblem = await this.checkObservesLimit(
      observe.guildId,
      observe.userId
    );
    if (limitProblem) {
      return { successful: false, message: limitProblem };
    }

    if (await this.findByName(observe.guildId, observe.userId, observe.name)) {
      return {
        successful: false,
        message: `You already have an Observe called \`${observe.name}\` - pick another name, or change that one with \`/edit\`.`,
      };
    }

    const scrapeResult =
      options.scrapeResult ??
      (await this.preview(observe.guildId, targetOf(observe)));
    const validation = this.validate(observe, scrapeResult);
    if (!validation.successful) {
      return { ...validation, scrapeResult };
    }

    const now = Date.now();
    const created = await prisma.observe.create({
      data: {
        ...observe.toPrisma(),
        createdAtMS: now,
        lastScrapeAtMS: now,
        nextScrapeAtMS: observe.scrapeInterval.nextScrapeAtMS(now),
        amountScraped: 1,
        ...this.baselineFields(observe, scrapeResult as ScrapeSuccess, validation.baseline!),
      },
    });
    const saved = Observe.fromPrisma(created);
    await this.log(saved, scrapeResult, 'created');
    return { successful: true, observe: saved, scrapeResult };
  }

  // The single place a check's *effects* get applied (history, failure
  // counting, confirmation, notification, (de)activation) - used by both the
  // background scheduler and the manual `/scrape` command.
  public async processObserve(
    observe: Observe,
    options: { notify?: boolean } = {}
  ): Promise<CheckResult> {
    if (this.inFlight.has(observe.id)) {
      return { outcome: 'busy', observe };
    }

    this.inFlight.add(observe.id);
    try {
      const outcome = await this.check(observe, options.notify ?? true);
      return {
        ...outcome,
        observe: (await this.getObserve(observe.id)) ?? observe,
      };
    } finally {
      this.inFlight.delete(observe.id);
    }
  }

  private async check(
    observe: Observe,
    notify: boolean
  ): Promise<Omit<CheckResult, 'observe'>> {
    const settings = await this.settingsService.getSettings(observe.guildId);
    const scrapeOptions = { timeoutMS: settings.timeout * 1000 };
    // The manual /scrape shows the result right away, screenshot included.
    const result = await this.scrapeService.scrape(targetOf(observe), {
      ...scrapeOptions,
      screenshot: !notify,
    });
    const now = Date.now();
    const common = {
      lastScrapeAtMS: now,
      nextScrapeAtMS: observe.scrapeInterval.nextScrapeAtMS(now),
      amountScraped: { increment: 1 },
    } satisfies Prisma.ObserveUpdateInput;

    if (!result.ok) {
      await this.log(observe, result);
      await this.handleFailure(observe, result, common, settings, notify);
      return { outcome: 'failed', scrapeResult: result };
    }

    const evaluation = evaluate(observe, result);
    await this.log(observe, result, evaluation.triggered ? 'needs confirmation' : undefined);

    if (!evaluation.triggered) {
      await this.update(observe, {
        ...common,
        thumbnail: result.thumbnail ?? undefined,
        consecutiveTimeouts: 0,
        lastState: evaluation.state,
        lastText: this.storedText(observe, result),
        lastResult: this.describeOk(observe, result),
        lastError: null,
      });
      return { outcome: 'unchanged', scrapeResult: result };
    }

    await sleep(notify ? CONFIRM_DELAY_MS : MANUAL_CONFIRM_DELAY_MS);
    const recheck = await this.scrapeService.scrape(targetOf(observe), {
      ...scrapeOptions,
      screenshot: true,
    });
    if (!recheck.ok) {
      // Couldn't look a second time (rate limit, bot wall, timeout): that's
      // a failed check, not a verdict - count it and look again soon,
      // instead of waiting a whole interval and calling it a glitch.
      await this.log(observe, recheck, 'confirmation check');
      await this.handleFailure(
        observe,
        recheck,
        {
          ...common,
          nextScrapeAtMS: Math.min(common.nextScrapeAtMS, now + CONFIRM_RETRY_MS),
        },
        settings,
        notify,
        // The first load of this check worked, so the old streak is over.
        0
      );
      return { outcome: 'failed', scrapeResult: recheck };
    }

    const confirmed = evaluate(observe, recheck).triggered;
    await this.log(observe, recheck, confirmed ? 'confirmed' : 'not confirmed');

    if (!confirmed) {
      logger.info(
        `Observe ${observe.id} (${observe.name}): change not confirmed by a second load, ignoring it`
      );
      await this.update(observe, {
        ...common,
        consecutiveTimeouts: 0,
        lastResult: 'change not confirmed by a second load',
        lastError: null,
      });
      return { outcome: 'unconfirmed', scrapeResult: recheck };
    }

    const confirmedResult = recheck;
    const deactivate = !observe.keepActive;
    const delivered = notify
      ? await this.notifier.notify(
          observe,
          buildTriggerNotification(
            observe,
            confirmedResult,
            observe.lastText,
            deactivate
          )
        )
      : // The user is looking at the result of their /scrape right now.
        true;

    if (!delivered) {
      // Leave lastState alone so the next check sees the same transition
      // and tries to deliver again.
      await this.update(observe, {
        ...common,
        nextScrapeAtMS: Math.min(common.nextScrapeAtMS, now + UNDELIVERED_RETRY_MS),
        consecutiveTimeouts: 0,
        lastResult: 'change found, notification not delivered yet',
        lastError: 'Could not reach you by DM or in a channel - retrying',
      });
      return { outcome: 'undelivered', scrapeResult: confirmedResult };
    }

    await this.update(observe, {
      ...common,
      thumbnail: confirmedResult.thumbnail ?? undefined,
      consecutiveTimeouts: 0,
      lastState: evaluate(observe, confirmedResult).state,
      lastText: this.storedText(observe, confirmedResult),
      lastResult: 'triggered',
      lastError: null,
      triggeredAtMS: now,
      active: deactivate ? false : undefined,
    });
    logger.info(`Observe ${observe.id} (${observe.name}): change found and notified`);
    return { outcome: 'triggered', scrapeResult: confirmedResult };
  }

  private async handleFailure(
    observe: Observe,
    result: ScrapeError,
    common: Prisma.ObserveUpdateInput,
    settings: Awaited<ReturnType<SettingsService['getSettings']>>,
    notify: boolean,
    // Failures in a row before this one - 0 when an earlier load of the
    // same check already succeeded and ended the streak.
    streakBefore = observe.consecutiveTimeouts
  ): Promise<void> {
    const consecutive = streakBefore + 1;
    const total = observe.timeouts + 1;
    const limitReached = consecutive >= settings.consecutiveTimeoutsLimit;

    await this.update(observe, {
      ...common,
      consecutiveTimeouts: consecutive,
      timeouts: { increment: 1 },
      lastResult: result.failure,
      lastError: failureText(result.failure, {
        cssSelector: observe.cssSelector,
        httpStatus: result.httpStatus,
      }),
      active: limitReached ? false : undefined,
    });
    logger.warn(
      `Observe ${observe.id} (${observe.name}) check failed (${consecutive} in a row): ${result.failure} - ${result.detail}`
    );

    if (!notify) {
      return;
    }

    let notice: FailureNotice | undefined;
    if (limitReached) {
      notice = 'deactivated';
    } else if (consecutive === 1 && settings.notifyOnFirstTimeout) {
      notice = 'first';
    } else if (total === settings.timeoutsTillNotify) {
      notice = 'cumulative';
    }

    if (notice) {
      await this.notifier.notify(
        observe,
        buildFailureNotification(observe, result, notice, settings)
      );
    }
  }

  public async editObserve(
    guildId: string,
    userId: string,
    name: string,
    edits: {
      // `undefined` means "not provided, keep the current value". `cssSelector`
      // additionally supports `null` to mean "provided, clear it" (go back to
      // whole-page search), since it's the one field that can be unset.
      name?: string;
      url?: string;
      cssSelector?: string | null;
      watchText?: string;
      watchMode?: string;
      notifyMode?: string;
      scrapeInterval?: string;
      keepActive?: boolean;
    },
    options: { scrapeResult?: ScrapeResult } = {}
  ): Promise<ValidationResult> {
    const current = await this.findByName(guildId, userId, name);
    if (!current) {
      return {
        successful: false,
        message: `You don't have an Observe called \`${name}\` - check \`/list\`.`,
      };
    }

    // A check running meanwhile would write its (old target's) state over
    // the new baseline, or this edit over the check's result.
    if (this.inFlight.has(current.id)) {
      return {
        successful: false,
        message: `\`${current.name}\` is being checked right now - try again in a moment.`,
      };
    }

    this.inFlight.add(current.id);
    try {
      return await this.applyEdit(current, edits, options);
    } finally {
      this.inFlight.delete(current.id);
    }
  }

  private async applyEdit(
    current: Observe,
    edits: Parameters<ObserveManager['editObserve']>[3],
    options: { scrapeResult?: ScrapeResult }
  ): Promise<ValidationResult> {
    const { guildId, userId } = current;
    const newName = edits.name?.trim() ?? current.name;
    if (
      newName !== current.name &&
      (await this.findByName(guildId, userId, newName))
    ) {
      return {
        successful: false,
        message: `You already have an Observe called \`${newName}\`.`,
      };
    }

    const input: ObserveInput = {
      ...current.toInput(),
      name: newName,
      url: edits.url ?? current.url,
      cssSelector:
        edits.cssSelector === undefined ? current.cssSelector : edits.cssSelector,
      watchText: edits.watchText ?? current.watchText,
      watchMode: edits.watchMode ?? current.watchMode,
      notifyMode: edits.notifyMode ?? current.notifyMode,
      scrapeInterval: edits.scrapeInterval ?? current.scrapeInterval,
      keepActive: edits.keepActive ?? current.keepActive,
    };
    const updated = Observe.create(input, current);
    if (!(updated instanceof Observe)) {
      return { successful: false, message: updated.message };
    }

    const now = Date.now();
    // Only what the user controls - counters and state belong to the checks.
    const fields = updated.toPrisma();
    let data: Prisma.ObserveUpdateInput = {
      name: fields.name,
      url: fields.url,
      cssSelector: fields.cssSelector,
      watchText: fields.watchText,
      watchMode: fields.watchMode,
      notifyMode: fields.notifyMode,
      scrapeIntervalType: fields.scrapeIntervalType,
      keepActive: fields.keepActive,
      updatedAtMS: now,
    };
    let scrapeResult: ScrapeResult | undefined;

    // A different target needs to work - and a new baseline - before it's
    // saved; otherwise a typo turns into a bogus "change found" next check.
    if (!updated.hasSameTarget(current)) {
      scrapeResult =
        options.scrapeResult ??
        (await this.preview(guildId, targetOf(updated)));
      const validation = this.validate(updated, scrapeResult);
      if (!validation.successful) {
        // The unsaved version, so the reply can show what was tried.
        return { ...validation, scrapeResult, observe: updated };
      }

      data = {
        ...data,
        consecutiveTimeouts: 0,
        lastScrapeAtMS: now,
        nextScrapeAtMS: updated.scrapeInterval.nextScrapeAtMS(now),
        ...this.baselineFields(updated, scrapeResult as ScrapeSuccess, validation.baseline!),
      };
    } else if (
      updated.scrapeInterval.type !== current.scrapeInterval.type
    ) {
      data.nextScrapeAtMS = updated.scrapeInterval.nextScrapeAtMS(
        Number(current.lastScrapeAtMS) || now
      );
    }

    await prisma.observe.update({ where: { id: current.id }, data });
    return {
      successful: true,
      observe: await this.getObserve(current.id),
      scrapeResult,
    };
  }

  public async deleteObserve(observe: Observe): Promise<CommandResult> {
    const { count } = await prisma.observe.deleteMany({
      where: { id: observe.id },
    });
    return count > 0
      ? {
          successful: true,
          message: `Your Observe \`${observe.name}\` has been deleted.`,
        }
      : {
          successful: false,
          message: `Your Observe \`${observe.name}\` doesn't exist anymore.`,
        };
  }

  public async setActive(
    observe: Observe,
    active: boolean
  ): Promise<CommandResult> {
    if (observe.active === active) {
      return {
        successful: false,
        message: `Your Observe \`${observe.name}\` is already ${active ? 'active' : 'paused'}.`,
      };
    }

    await prisma.observe.update({
      where: { id: observe.id },
      data: active
        ? {
            active: true,
            updatedAtMS: Date.now(),
            // A fresh run of the full failure limit, and a check right away.
            // `lastState` stays: an Observe that just notified about a
            // change waits for the *next* one instead of repeating it.
            consecutiveTimeouts: 0,
            nextScrapeAtMS: 0,
          }
        : { active: false, updatedAtMS: Date.now() },
    });
    return {
      successful: true,
      message: active
        ? `Your Observe \`${observe.name}\` is active again and will be checked right away.`
        : `Your Observe \`${observe.name}\` is paused - \`/reactivate\` resumes it.`,
    };
  }

  // The bot left (or was removed from) a guild: stop checking its Observes,
  // but keep them in case it comes back.
  public async deactivateGuild(guildId: string): Promise<number> {
    const { count } = await prisma.observe.updateMany({
      where: { guildId, active: true },
      data: { active: false },
    });
    return count;
  }

  public async getHistory(observe: Observe, limit = 20): Promise<ScrapeLog[]> {
    return prisma.scrapeLog.findMany({
      where: { observeId: observe.id },
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  public async getStats(sinceMS: number, guildIds?: string[]) {
    const observeWhere = guildIds ? { guildId: { in: guildIds } } : {};
    const [total, active, failing, outcomes] = await Promise.all([
      prisma.observe.count({ where: observeWhere }),
      prisma.observe.count({ where: { ...observeWhere, active: true } }),
      this.getObserves({ guildIds, active: true }).then((observes) =>
        observes.filter((observe) => observe.consecutiveTimeouts > 0)
      ),
      prisma.scrapeLog.groupBy({
        by: ['outcome'],
        where: { atMS: { gte: sinceMS }, observe: observeWhere },
        _count: { _all: true },
        _avg: { durationMS: true },
      }),
    ]);
    return {
 total, active, failing, outcomes,
};
  }

  // Whether a scrape result is a sound starting point for watching
  // `observe`, with a message that tells the user what to fix if not.
  public validate(
    observe: Pick<Observe, 'watchMode' | 'watchText' | 'cssSelector'>,
    result: ScrapeResult
  ): ValidationResult & { baseline?: string } {
    if (!result.ok) {
      return {
        successful: false,
        message: `Couldn't check the page: ${failureText(result.failure, {
          cssSelector: observe.cssSelector,
          httpStatus: result.httpStatus,
        })}. Nothing was saved.`,
      };
    }

    const check = validateBaseline(observe.watchMode, result);
    if ('baseline' in check) {
      return { successful: true, baseline: check.baseline };
    }

    const where = observe.cssSelector ? ` inside \`${observe.cssSelector}\`` : '';
    const message = {
      TextNotFound: `\`${observe.watchText}\` isn't on the page${where} right now, so there's nothing that could disappear. Use the text exactly as the page shows it (case doesn't matter) - \`/preview\` shows what the bot sees. To get notified when it shows up instead, use \`mode: Text appears\`.`,
      TextAlreadyThere: `\`${observe.watchText}\` is already on the page${where}, so it can't appear anymore. To get notified when it goes away instead, use \`mode: Text disappears\`.`,
      NoText: `\`${observe.cssSelector ?? ''}\` has no visible text to watch for changes.`,
    }[check.problem];
    return { successful: false, message };
  }

  private baselineFields(
    observe: Observe,
    result: ScrapeSuccess,
    baseline: string
  ) {
    return {
      lastState: baseline,
      lastText: this.storedText(observe, result),
      lastResult: this.describeOk(observe, result),
      lastError: null,
      thumbnail: result.thumbnail,
    };
  }

  private storedText(observe: Observe, result: ScrapeSuccess): string | null {
    return observe.watchMode === WatchMode.Changes
      ? truncate(normalizeText(result.text), MAX_STORED_TEXT)
      : null;
  }

  private describeOk(observe: Observe, result: ScrapeSuccess): string {
    if (observe.watchMode === WatchMode.Changes) {
      return observe.lastState === null ||
        observe.lastState === hashText(result.text)
        ? 'content unchanged'
        : 'content changed';
    }

    return result.matchFound ? 'text present' : 'text absent';
  }

  private async update(observe: Observe, data: Prisma.ObserveUpdateInput) {
    // The Observe may have been deleted while it was being checked.
    await prisma.observe.updateMany({
      where: { id: observe.id },
      data: data as Prisma.ObserveUpdateManyMutationInput,
    });
  }

  private async log(
    observe: Observe,
    result: ScrapeResult,
    note?: string
  ): Promise<void> {
    const outcome = result.ok
      ? observe.watchMode === WatchMode.Changes
        ? observe.lastState === null || observe.lastState === hashText(result.text)
          ? 'same'
          : 'changed'
        : result.matchFound
          ? 'present'
          : 'absent'
      : result.failure;
    const detail = [note, result.ok ? undefined : result.detail]
      .filter(Boolean)
      .join(' · ');

    try {
      await prisma.scrapeLog.create({
        data: {
          observeId: observe.id,
          atMS: Date.now(),
          outcome,
          httpStatus: result.httpStatus,
          durationMS: result.durationMS,
          detail: detail ? truncate(detail, 300) : null,
        },
      });
      await prisma.$executeRaw`DELETE FROM ScrapeLog WHERE observeId = ${observe.id} AND id NOT IN (SELECT id FROM ScrapeLog WHERE observeId = ${observe.id} ORDER BY id DESC LIMIT ${HISTORY_SIZE})`;
    } catch (error: unknown) {
      // History is nice to have - never let it break a check. (Also: the
      // Observe may have been deleted meanwhile, failing the foreign key.)
      logger.debug(error);
    }
  }

  private async checkObservesLimit(
    guildId: string,
    userId: string
  ): Promise<string | undefined> {
    const settings = await this.settingsService.getSettings(guildId);
    const [guildCount, userCount] = await Promise.all([
      prisma.observe.count({ where: { guildId } }),
      prisma.observe.count({ where: { guildId, userId } }),
    ]);

    if (guildCount >= settings.guildObserveLimit) {
      return `This server has reached its limit of ${settings.guildObserveLimit} Observes.`;
    }

    if (userCount >= settings.userObserveLimit) {
      return `You have reached the limit of ${settings.userObserveLimit} Observes per user - delete one with \`/delete\` first.`;
    }

    return undefined;
  }
}
