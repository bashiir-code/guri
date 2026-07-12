import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// "3h ago" style relative time for queue ages (so/en via Intl).
export function timeAgo(date: string | Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'so' ? 'so' : 'en', { numeric: 'auto' });
  const diffMs = new Date(date).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
