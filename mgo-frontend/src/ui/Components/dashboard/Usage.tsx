import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { IconType } from "react-icons";
import {
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuCreditCard,
  LuDatabase,
  LuInfo,
  LuMail,
  LuMessagesSquare,
  LuSparkles,
  LuTrendingUp,
  LuWallet,
  LuX,
} from "react-icons/lu";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { ApiError } from "../../../api/client";
import {
  buildBillingPeriods,
  getSubscription,
  getUsage,
} from "../../../api/usage";
import type {
  BillingPeriod,
  Subscription,
  UsageSnapshot,
} from "../../../api/usage";
import type { RootState } from "../../../Redux/Store";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatPeriodLabel,
  formatStorage,
} from "./billingFormat";

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const CARD = "rounded-xl border border-line bg-white p-5 shadow-soft";

const STATUS_LABELS: Record<Subscription["status"], string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment due",
  canceled: "Canceled",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "We couldn't load your usage. Please try again.";
}

function periodKey(period: BillingPeriod): string {
  return `${period.start}:${period.end}`;
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

function UsageCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: IconType;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/**
 * Used / limit meter. `limit === null` renders the plan's unlimited state
 * instead of dividing by zero.
 */
function UsageMeter({
  label,
  used,
  limit,
  format,
  hint,
}: {
  label: string;
  used: number;
  limit: number | null;
  format: (value: number) => string;
  hint?: string;
}) {
  const unlimited = limit === null;
  const rawPercent = unlimited || limit <= 0 ? 0 : (used / limit) * 100;
  const percent = Math.min(100, Math.max(0, rawPercent));
  const reached = !unlimited && used >= limit;

  const tone = reached
    ? "bg-red-500"
    : percent >= 85
      ? "bg-amber-500"
      : "bg-brand-500";

  const valueText = `${format(used)} of ${
    unlimited ? "unlimited" : format(limit)
  }`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-ink-700">{label}</span>
        <span className="text-[13px] text-ink-500">
          <span className="font-semibold text-ink-900">{format(used)}</span>
          {" / "}
          <span>{unlimited ? "Unlimited" : format(limit)}</span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={valueText}
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
          style={{ width: unlimited ? "0%" : `${percent}%` }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px] text-ink-400">
        <span>
          {unlimited
            ? "No limit on this plan"
            : reached
              ? "Limit reached"
              : `${Math.round(percent)}% used`}
        </span>

        {!unlimited && !reached ? (
          <span>{format(Math.max(0, limit - used))} left</span>
        ) : null}
      </div>

      {hint ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1, 2].map((section) => (
        <div key={section} className={`${CARD} animate-pulse`}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-100" />
            <div className="space-y-2">
              <div className="h-3 w-32 rounded bg-slate-100" />
              <div className="h-2.5 w-52 rounded bg-slate-100" />
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="h-2 w-full rounded-full bg-slate-100" />
            <div className="h-2 w-full rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageError({
  title = "Usage unavailable",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      className={`${CARD} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
        <LuCircleAlert className="h-5 w-5" aria-hidden="true" />
      </span>

      <div>
        <h2 className="text-[14px] font-semibold text-ink-900">{title}</h2>
        <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
          {message}
        </p>
      </div>

      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
        Try again
      </button>
    </section>
  );
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section
      className={`${CARD} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-ink-400">
        <LuCreditCard className="h-5 w-5" aria-hidden="true" />
      </span>

      <div>
        <h2 className="text-[14px] font-semibold text-ink-900">{title}</h2>
        <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
          {message}
        </p>
      </div>

      <Link to="/dashboard/billing" className={PRIMARY_BUTTON}>
        Go to Billing
        <LuChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Increase limits dialog                                                     */
/* -------------------------------------------------------------------------- */

function IncreaseLimitsDialog({
  planName,
  currency,
  onClose,
}: {
  planName: string;
  currency: string;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const option =
    "flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand-500 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-ink-900">
              Increase your limits
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
              Your {planName} limits come from the billing plan. Choose how
              you'd like to continue.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          <Link to="/dashboard/billing" onClick={onClose} className={option}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LuSparkles className="h-4 w-4" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink-900">
                Upgrade to a higher plan
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
                Compare plans and check out through the existing billing flow.
              </span>
            </span>

            <LuChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-ink-400"
              aria-hidden="true"
            />
          </Link>

          <Link to="/dashboard/billing" onClick={onClose} className={option}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
              <LuCreditCard className="h-4 w-4" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink-900">
                Review your subscription
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
                Change plan, billing cycle, payment method and invoices.
              </span>
            </span>

            <LuChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-ink-400"
              aria-hidden="true"
            />
          </Link>

          <a
            href="mailto:billing@margo.com?subject=Usage%20limit%20increase"
            className={option}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500">
              <LuMail className="h-4 w-4" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink-900">
                Contact your Margo administrator
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
                Ask about add-on capacity for your workspace.
              </span>
            </span>

            <LuChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-ink-400"
              aria-hidden="true"
            />
          </a>
        </div>

        <footer className="border-t border-line px-5 py-3">
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-400">
            <LuInfo
              className="mt-px h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            Limits and currency ({currency}) are configured in Billing. No
            separate limit settings are kept on this page.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Usage — consumption for one billing period measured against the limits of
 * the company's active billing plan. Plan limits, names and currency are read
 * from the `billing` slice, so admin edits appear here immediately.
 */
export function Usage() {
  const settings = useSelector((state: RootState) => state.billing);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionSettled, setSubscriptionSettled] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const [periodIndex, setPeriodIndex] = useState<number | null>(null);
  const [usage, setUsage] = useState<{
    key: string;
    data: UsageSnapshot;
  } | null>(null);
  const [usageError, setUsageError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [usageAttempt, setUsageAttempt] = useState(0);

  const [limitsOpen, setLimitsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getSubscription()
      .then((next) => {
        if (cancelled) return;
        setSubscription(next);
        setSubscriptionSettled(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSubscriptionError(describeError(error));
        setSubscriptionSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [subscriptionAttempt]);

  const periods = useMemo(
    () => (subscription ? buildBillingPeriods(subscription) : []),
    [subscription],
  );

  const selectedIndex =
    periodIndex === null
      ? periods.length - 1
      : Math.max(0, Math.min(periodIndex, periods.length - 1));

  const period: BillingPeriod | undefined = periods[selectedIndex];
  const isCurrentPeriod =
    periods.length > 0 && selectedIndex === periods.length - 1;

  useEffect(() => {
    if (!period) return;

    let cancelled = false;
    const key = periodKey(period);

    getUsage(period)
      .then((data) => {
        if (!cancelled) setUsage({ key, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUsageError({ key, message: describeError(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, usageAttempt]);

  const key = period ? periodKey(period) : "";
  const usageData = usage?.key === key ? usage.data : null;
  const usageMessage = usageError?.key === key ? usageError.message : null;
  const usageLoading = Boolean(period) && !usageData && !usageMessage;

  const plan = subscription
    ? (settings.plans.find((item) => item.id === subscription.planId) ?? null)
    : null;

  function retrySubscription() {
    setSubscriptionError(null);
    setSubscriptionSettled(false);
    setSubscriptionAttempt((attempt) => attempt + 1);
  }

  function retryUsage() {
    setUsage(null);
    setUsageError(null);
    setUsageAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="space-y-5">
      {/* Header controls — the shell supplies the title and description. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-line bg-white">
            <button
              type="button"
              onClick={() => setPeriodIndex(Math.max(0, selectedIndex - 1))}
              disabled={!period || selectedIndex <= 0}
              aria-label="Previous billing period"
              className="flex h-9 w-9 items-center justify-center rounded-l-lg text-ink-500 transition-colors hover:bg-slate-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:text-ink-400/50 disabled:hover:bg-transparent"
            >
              <LuChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <span className="min-w-46 border-x border-line px-3 py-1.5 text-center text-[12.5px] font-medium text-ink-900">
              {period
                ? formatPeriodLabel(period.start, period.end)
                : "Billing period"}
            </span>

            <button
              type="button"
              onClick={() =>
                setPeriodIndex(Math.min(periods.length - 1, selectedIndex + 1))
              }
              disabled={!period || isCurrentPeriod}
              aria-label="Next billing period"
              className="flex h-9 w-9 items-center justify-center rounded-r-lg text-ink-500 transition-colors hover:bg-slate-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:text-ink-400/50 disabled:hover:bg-transparent"
            >
              <LuChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {period ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isCurrentPeriod
                  ? "bg-brand-50 text-brand-700"
                  : "bg-slate-100 text-ink-500"
              }`}
            >
              {isCurrentPeriod ? "Current period" : "Historical period"}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setLimitsOpen(true)}
          className={PRIMARY_BUTTON}
        >
          <LuTrendingUp className="h-4 w-4" aria-hidden="true" />
          Increase limits
        </button>
      </div>

      {subscriptionError ? (
        <UsageError message={subscriptionError} onRetry={retrySubscription} />
      ) : !subscriptionSettled ? (
        <UsageSkeleton />
      ) : !subscription ? (
        <EmptyState
          title="No active subscription"
          message="This workspace doesn't have a billing plan yet, so there are no usage limits to track."
        />
      ) : !plan ? (
        <EmptyState
          title="Plan no longer available"
          message={`The billing catalogue no longer contains the plan “${subscription.planId}”. Choose a plan in Billing to keep tracking usage.`}
        />
      ) : (
        <>
          {/* Active plan + billing link */}
          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <LuCreditCard className="h-4.5 w-4.5" aria-hidden="true" />
                </span>

                <div>
                  <p className="text-[13.5px] font-semibold text-ink-900">
                    {plan.name} plan
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
                      {subscription.cycle === "annual" ? "Annual" : "Monthly"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {STATUS_LABELS[subscription.status]} · Since{" "}
                    {formatDate(subscription.startedAt)}
                  </p>
                </div>
              </div>

              <Link to="/dashboard/billing" className={SECONDARY_BUTTON}>
                View billing
                <LuChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {subscription.status !== "active" ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-[#ffeacf] bg-[#ffeacf]/50 px-3 py-2 text-[12px] leading-relaxed text-ink-700">
                <LuInfo
                  className="mt-px h-3.5 w-3.5 shrink-0 text-brand-700"
                  aria-hidden="true"
                />
                {subscription.status === "trialing"
                  ? "Your trial is active. Usage is tracked against the plan limits until it ends."
                  : subscription.status === "past_due"
                    ? "A payment is due. Update your payment method in Billing to keep your limits active."
                    : "This subscription is canceled. Your current limits stay in place until the period ends."}
              </p>
            ) : null}
          </section>

          {usageMessage ? (
            <UsageError message={usageMessage} onRetry={retryUsage} />
          ) : !period ? (
            <EmptyState
              title="Billing period unavailable"
              message="We couldn't work out the current billing period from the subscription dates. Check the subscription in Billing."
            />
          ) : usageLoading || !usageData ? (
            <UsageSkeleton />
          ) : (
            <>
              <UsageCard
                icon={LuMessagesSquare}
                title="Conversations"
                description="Chats started by visitors during the selected billing period."
              >
                <UsageMeter
                  label="Conversations used"
                  used={usageData.conversations}
                  limit={plan.limits.conversations}
                  format={formatCount}
                  hint="When this limit is reached, new conversations pause until the period resets or your limit is increased. Existing chats stay available."
                />
              </UsageCard>

              <UsageCard
                icon={LuDatabase}
                title="Storage"
                description="Knowledge tables, vector embeddings and uploaded files."
              >
                <UsageMeter
                  label="Table rows"
                  used={usageData.tableRows}
                  limit={plan.limits.tableRows}
                  format={formatCount}
                  hint="Rows stored across the tables generated from your knowledge sources."
                />

                <UsageMeter
                  label="Vector DB storage"
                  used={usageData.vectorStorageMb}
                  limit={plan.limits.vectorStorageMb}
                  format={formatStorage}
                  hint="Embeddings created for your website pages, files and FAQ entries."
                />

                <UsageMeter
                  label="File storage"
                  used={usageData.fileStorageMb}
                  limit={plan.limits.fileStorageMb}
                  format={formatStorage}
                  hint="Documents and uploads attached to your agents."
                />
              </UsageCard>

              <UsageCard
                icon={LuWallet}
                title="AI usage"
                description={`AI spending for this period, billed in ${settings.currency}.`}
              >
                <UsageMeter
                  label="AI spend"
                  used={usageData.aiSpend}
                  limit={plan.limits.aiSpend}
                  format={(value) => formatMoney(value, settings.currency)}
                  hint="AI calls pause when the allowance is fully used. Increase the limit or upgrade your plan to continue."
                />
              </UsageCard>

              <p className="text-[11.5px] leading-relaxed text-ink-400">
                Limits and currency come from your billing plan and update
                automatically when the plan changes. Consumption figures are
                sample data until the usage API is connected.
              </p>
            </>
          )}
        </>
      )}

      {limitsOpen ? (
        <IncreaseLimitsDialog
          planName={plan?.name ?? "current"}
          currency={settings.currency}
          onClose={() => setLimitsOpen(false)}
        />
      ) : null}
    </div>
  );
}
