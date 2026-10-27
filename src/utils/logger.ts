import debug from './debug.js';

// Warnings and errors always reach `docker logs` - `debug()` stays for the
// chatty stuff and only prints with DEBUG=update-day set, which used to hide
// every failed scrape and every undeliverable notification.
const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
};

const write = (
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  error?: unknown
) => {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  const out = level === 'INFO' ? console.log : console.error;
  out(error === undefined ? line : `${line}\n${describe(error)}`);
};

const logger = {
  info(message: string) {
    write('INFO', message);
  },
  warn(message: string, error?: unknown) {
    write('WARN', message, error);
  },
  error(message: string, error?: unknown) {
    write('ERROR', message, error);
  },
  debug,
};

export default logger;
