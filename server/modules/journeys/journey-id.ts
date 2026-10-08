import { AppError } from '../../errors.js';

export interface ParsedJourneyId {
  trainNumber: string;
  serviceDate: string; // YYYY-MM-DD (IST)
}

const JOURNEY_ID = /^([0-9A-Za-z]{3,8})_(\d{4}-\d{2}-\d{2})$/;

/** Current service date in India Standard Time. */
export function serviceDateIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function makeJourneyId(trainNumber: string, serviceDate: string): string {
  return `${trainNumber}_${serviceDate}`;
}

export function parseJourneyId(id: string): ParsedJourneyId {
  const m = JOURNEY_ID.exec(id);
  if (!m) throw new AppError('INVALID_REQUEST', 'Invalid journey id.');
  const [, trainNumber, serviceDate] = m as unknown as [string, string, string];
  if (Number.isNaN(Date.parse(serviceDate))) throw new AppError('INVALID_REQUEST', 'Invalid journey id.');
  return { trainNumber, serviceDate };
}
