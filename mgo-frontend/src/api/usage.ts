import { call } from "./client";
import { endpoints } from "./endpoints";
import type {
  BillingPeriod,
  Subscription,
  UsageSnapshot,
} from "./endpoints";

export type { BillingPeriod, Subscription, UsageSnapshot };

const DAY_MS = 86_400_000;

/** The company's active subscription — the source of the billing periods. */
export async function getSubscription(): Promise<Subscription | null> {
  return call<undefined, Subscription | null>(
    endpoints.billing.subscription,
    undefined,
  );
}

/** Actual consumption for one billing period (mock until the API exists). */
export async function getUsage(period: BillingPeriod): Promise<UsageSnapshot> {
  return call(endpoints.usage.summary, {
    periodStart: period.start,
    periodEnd: period.end,
  });
}

/**
 * Every billing period from the subscription start up to the current one.
 * Periods follow the real billing anchor date (e.g. the 12th), never the 1st.
 */
export function buildBillingPeriods(
  subscription: Subscription,
): BillingPeriod[] {
  const started = parseDate(subscription.startedAt);
  const currentStart = parseDate(subscription.currentPeriodStart);

  if (!started || !currentStart) return [];

  const stepMonths = subscription.cycle === "annual" ? 12 : 1;
  const periods: BillingPeriod[] = [];
  let cursor = started;

  // 240 periods = 20 years monthly; also guards against bad dates.
  while (cursor.getTime() <= currentStart.getTime() && periods.length < 240) {
    const next = addMonths(cursor, stepMonths);

    periods.push({
      start: toISODate(cursor),
      end: toISODate(new Date(next.getTime() - DAY_MS)),
    });

    cursor = next;
  }

  if (!periods.length) {
    periods.push({
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    });
  }

  return periods;
}

function parseDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, count: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + count,
      date.getUTCDate(),
    ),
  );
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
