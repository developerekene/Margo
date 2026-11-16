/**
 * Shared currency, number and date formatting for the Billing and Usage
 * screens. Keeping it in one place stops the two pages from disagreeing about
 * how a price, a limit or a storage amount is rendered.
 */

export type CurrencyOption = {
  code: string;
  label: string;
};

/** Currencies the admin can bill in (ISO 4217). */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "NGN", label: "Nigerian Naira (NGN)" },
  { code: "KES", label: "Kenyan Shilling (KES)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "CAD", label: "Canadian Dollar (CAD)" },
  { code: "AUD", label: "Australian Dollar (AUD)" },
  { code: "AED", label: "UAE Dirham (AED)" },
];

const countFormatter = new Intl.NumberFormat("en-US");

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** 1240 -> "1,240". */
export function formatCount(value: number): string {
  return countFormatter.format(Math.round(value));
}

/**
 * Money in the workspace billing currency. `compact` hides cents on whole
 * amounts so plan prices read "$19" instead of "$19.00".
 */
export function formatMoney(
  value: number,
  currency: string,
  compact = false,
): string {
  const whole = compact && Number.isInteger(value);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(value);
  } catch {
    // Unknown ISO code — still show something sensible.
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Megabytes -> "48 MB", "1.2 GB" or "2.4 TB". */
export function formatStorage(megabytes: number): string {
  if (!Number.isFinite(megabytes) || megabytes <= 0) return "0 MB";

  if (megabytes < 1024) return `${trimUnit(megabytes)} MB`;

  const gigabytes = megabytes / 1024;
  if (gigabytes < 1024) return `${trimUnit(gigabytes)} GB`;

  return `${trimUnit(gigabytes / 1024)} TB`;
}

function trimUnit(value: number): string {
  if (value >= 100) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}

/** "2026-10-12" -> "Oct 12, 2026". */
export function formatDate(value: string): string {
  const date = parseISODate(value);
  return date ? fullDateFormatter.format(date) : value;
}

/** "2026-10-12" + "2026-11-11" -> "Oct 12 – Nov 11, 2026". */
export function formatPeriodLabel(start: string, end: string): string {
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);

  if (!startDate || !endDate) return `${start} – ${end}`;

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${shortDateFormatter.format(startDate)} – ${fullDateFormatter.format(endDate)}`;
  }

  return `${fullDateFormatter.format(startDate)} – ${fullDateFormatter.format(endDate)}`;
}

/** Parse a `YYYY-MM-DD` date at UTC midnight (no timezone drift). */
export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}
