// A `string` is a deliberate, user-facing message (e.g. "you can't use this
// bot in a DM") - safe to show as-is. An `Error` is an unexpected bug - its
// internals (name/message/cause) aren't shown to users, only ever to
// `debug()`/logs, since they're implementation detail, not something a user
// can act on.
export default (error?: string | Error): string => {
  if (!error) {
    return '🚫 ope: unknown error';
  }

  if (typeof error === 'string') {
    return `🚫 ope: ${error}`;
  }

  return "🚫 ope: something went wrong on our end. This has been logged - please try again, or reach out if it keeps happening.";
};
