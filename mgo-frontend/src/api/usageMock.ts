import type { Subscription, UsageSnapshot } from "./endpoints";

const DAY_MS = 86_400_000;

/** Demo workspace bills on the 12th — deliberately not the 1st of the month. */
const BILLING_START_DAY = 12;
const SUBSCRIPTION_MONTHS = 8;

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addMonths(date: Date, count: number): Date {
  return utcDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + count,
    date.getUTCDate(),
  );
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * MOCK — the demo subscription.
 *
 * Replace with `GET /billing/subscription` once the endpoint exists; this
 * shape is the contract the Usage page consumes.
 */
export function mockSubscription(): Subscription {
  const now = new Date();

  const startedAt = utcDate(
    now.getUTCFullYear(),
    now.getUTCMonth() - SUBSCRIPTION_MONTHS,
    BILLING_START_DAY,
  );

  let currentStart = utcDate(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    BILLING_START_DAY,
  );

  // Before the anchor day the previous period is still running.
  if (now.getUTCDate() < BILLING_START_DAY) {
    currentStart = addMonths(currentStart, -1);
  }

  // A period can never start before the subscription did.
  const currentPeriodStart =
    currentStart.getTime() < startedAt.getTime() ? startedAt : currentStart;
  const currentPeriodEnd = new Date(
    addMonths(currentPeriodStart, 1).getTime() - DAY_MS,
  );

  return {
    planId: "starter",
    cycle: "monthly",
    status: "active",
    startedAt: toISODate(startedAt),
    currentPeriodStart: toISODate(currentPeriodStart),
    currentPeriodEnd: toISODate(currentPeriodEnd),
  };
}

/** Deterministic 0–1 value per period, so history never jumps between calls. */
function variation(periodStart: string, salt: number): number {
  const input = `${periodStart}:${salt}`;
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * MOCK — consumption for one billing period.
 *
 * Clearly demo numbers, not production usage. Replace with the real endpoint;
 * callers only depend on `UsageSnapshot`.
 */
export function mockUsage(
  periodStart: string,
  periodEnd: string,
): UsageSnapshot {
  return {
    periodStart,
    periodEnd,
    conversations: Math.round(140 + variation(periodStart, 1) * 240),
    tableRows: Math.round(1200 + variation(periodStart, 2) * 2600),
    vectorStorageMb: roundTo(11 + variation(periodStart, 3) * 24, 1),
    fileStorageMb: roundTo(18 + variation(periodStart, 4) * 48, 1),
    aiSpend: roundTo(0.32 + variation(periodStart, 5) * 1.3, 2),
  };
}
