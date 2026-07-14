// Somali date names. Browsers frequently ship no Somali CLDR data, so
// Intl.DateTimeFormat('so') silently falls back to English — these small
// tables keep the consoles' dates truly bilingual (design: "Talaado, 14
// Luulyo 2026"). English keeps using Intl.
const SO_WEEKDAYS = ['Axad', 'Isniin', 'Talaado', 'Arbaco', 'Khamiis', 'Jimco', 'Sabti'];
const SO_MONTHS = [
  'Janaayo',
  'Febraayo',
  'Maarso',
  'Abriil',
  'Maajo',
  'Juun',
  'Luulyo',
  'Ogosto',
  'Sebtembar',
  'Oktoobar',
  'Nofembar',
  'Desembar',
];
// Short forms as the design mock abbreviates them.
const SO_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Abr', 'Maj', 'Jun', 'Lul', 'Ogo', 'Seb', 'Okt', 'Nof', 'Des'];

/** "Talaado, 14 Luulyo 2026" (so) / "Tuesday, 14 July 2026" (en). */
export function formatLongDate(date: Date, locale: string): string {
  if (locale === 'so') {
    return `${SO_WEEKDAYS[date.getDay()]}, ${date.getDate()} ${SO_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** "Lul" (so) / "Jul" (en) — bar-chart axis labels. */
export function formatMonthShort(date: Date, locale: string): string {
  if (locale === 'so') return SO_MONTHS_SHORT[date.getMonth()];
  return new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
}

/** "Lul 2026" (so) / "Jul 2026" (en) — the table's joined column. */
export function formatMonthYear(date: Date, locale: string): string {
  if (locale === 'so') return `${SO_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(date);
}

/** "15 Luulyo 2026" (so) / "15 July 2026" (en) — legal "last updated" lines. */
export function formatDate(date: Date, locale: string): string {
  if (locale === 'so') return `${date.getDate()} ${SO_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
