import type { BillingPeriod, Subscription, UsageSnapshot } from "./endpoints";
import { mockSubscription, mockUsage } from "./usageMock";

export type { BillingPeriod, Subscription, UsageSnapshot };

const DAY_MS = 86_400_000;

/** Demo latency so the skeleton states stay visible while the API is mocked. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * MOCK — `GET /api/v1/billing/{tenant_id}/subscription` once the tenant id is
 * part of the session. Callers only depend on `Subscription`.
 */
export async function getSubscription(): Promise<Subscription> {
  await wait(450);
  return mockSubscription();
}

/**
 * MOCK — `POST /api/v1/usage/summary`. Callers only depend on `UsageSnapshot`.
 */
export async function getUsage(period: BillingPeriod): Promise<UsageSnapshot> {
  await wait(600);
  return mockUsage(period.start, period.end);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Same day next month, clamped so the 31st doesn't skip February. */
function addMonths(date: Date, count: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + count;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/**
 * Billing periods from the subscription start up to the running one, oldest
 * first — `periods[periods.length - 1]` is always the current period.
 */
export function buildBillingPeriods(
  subscription: Subscription,
): BillingPeriod[] {
  const periods: BillingPeriod[] = [];
  const startedAt = new Date(`${subscription.startedAt}T00:00:00Z`);
  const currentStart = new Date(`${subscription.currentPeriodStart}T00:00:00Z`);

  let cursor = startedAt;

  while (cursor.getTime() < currentStart.getTime()) {
    const next = addMonths(cursor, 1);
    const end = new Date(next.getTime() - DAY_MS);

    periods.push({ start: toISODate(cursor), end: toISODate(end) });
    cursor = next;
  }

  periods.push({
    start: subscription.currentPeriodStart,
    end: subscription.currentPeriodEnd,
  });

  return periods;
}
