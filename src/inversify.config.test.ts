// Catches what the other tests can't, since they construct classes by
// hand: a binding the container can't resolve, or a slash command Discord
// would reject - either one only shows up when the real bot starts.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DISCORD_TOKEN ??= 'test';

const { default: container } = await import('./inversify.config.js');
const { TYPES } = await import('./types.js');
type Command = import('./commands/command.js').default;

interface CommandJson {
  name: string;
  description?: string;
  required?: boolean;
  choices?: unknown[];
  options?: CommandJson[];
}

describe('dependency injection', () => {
  it('resolves the bot, scheduler and every command', () => {
    container.get(TYPES.Bot);
    container.get(TYPES.Managers.Scheduler);
    assert.ok(container.getAll<Command>(TYPES.Command).length > 0);
  });

  it('builds slash commands Discord accepts', () => {
    const check = (json: CommandJson, path: string) => {
      assert.ok((json.description ?? '').length <= 100, `${path}: description over 100 characters`);
      assert.ok((json.choices ?? []).length <= 25, `${path}: more than 25 choices`);
      const options = json.options ?? [];
      assert.ok(options.length <= 25, `${path}: more than 25 options`);
      const firstOptional = options.findIndex((option) => !option.required);
      assert.ok(
        firstOptional === -1 || options.slice(firstOptional).every((option) => !option.required),
        `${path}: required options must come first`
      );
      for (const option of options) {
        check(option, `${path} ${option.name}`);
      }
    };

    for (const command of container.getAll<Command>(TYPES.Command)) {
      const json = command.slashCommand.toJSON() as CommandJson;
      check(json, `/${json.name}`);
    }
  });

  it('routes every button prefix to exactly one command', () => {
    const prefixes = container
      .getAll<Command>(TYPES.Command)
      .flatMap((command) => command.handledButtonIds ?? []);
    assert.equal(new Set(prefixes).size, prefixes.length);
    for (const prefix of prefixes) {
      const overlapping = prefixes.filter((other) => other !== prefix && other.startsWith(prefix));
      assert.deepEqual(overlapping, [], `${prefix} shadows ${overlapping.join(', ')}`);
    }
  });
});
