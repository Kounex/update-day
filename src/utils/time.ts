import { TIMEZONE } from '../config.js';

export const prettyDateTime = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  });

// Discord renders these in each viewer's own timezone and locale.
export const discordTime = (
  ms: number | bigint,
  style: 'R' | 'f' | 'F' | 't' | 'T' | 'd' | 'D' = 'f'
): string => `<t:${Math.floor(Number(ms) / 1000)}:${style}>`;

export const prettyDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};
