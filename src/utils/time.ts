import Config from '../config.js';
import container from '../inversify.config.js';
import { TYPES } from '../types.js';

export const prettyTime = (seconds: number): string => {
  const nSeconds = seconds % 60;
  let nMinutes = Math.floor(seconds / 60);
  const nHours = Math.floor(nMinutes / 60);

  let res = '';

  if (nHours !== 0) {
    res += `${Math.round(nHours).toString().padStart(2, '0')}:`;
    nMinutes -= nHours * 60;
  }

  res += `${Math.round(nMinutes).toString().padStart(2, '0')}:${Math.round(
    nSeconds
  )
    .toString()
    .padStart(2, '0')}`;

  return res;
};

export const parseTime = (str: string): number =>
  str.split(':').reduce((acc, time) => 60 * acc + parseInt(time, 10), 0);

export const prettyDateTime = (ms: number): string => {
  const config = container.get<Config>(TYPES.Config);

  // Create a new Date object from the timestamp
  const date = new Date(ms);

  // Options for the date and time formatting
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: config.TIMEZONE,
  };

  // Use the toLocaleDateString method with 'de-DE' locale for German format
  const formattedDate = date.toLocaleDateString('de-DE', options);

  return formattedDate;
};
