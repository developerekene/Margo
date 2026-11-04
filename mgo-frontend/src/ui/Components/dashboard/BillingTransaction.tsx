import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { TRANSACTIONS } from "./mockdata";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TransactionStatus = "paid" | "pending" | "failed" | "refunded";

export type TransactionItem = {
  label: string;
  /** What the line covers, e.g. the billing period. */
  description?: string;
  amount: number;
};

export type Transaction = {
  id: string;
  invoiceNo: string;
  status: TransactionStatus;
  /** Total charged (or attempted) for this invoice. */
  amount: number;
  /** Plan name at the time of payment. */
  plan: string;
  cycle: "monthly" | "annual";
  /** ISO timestamp. */
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  email: string;
  /** Masked card — never the full number. */
  method: { brand: string; last4: string } | null;
  items: TransactionItem[];
  discount?: { label: string; amount: number };
  tax?: number;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const createdAtFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatMoney(value: number) {
  return `$${money.format(value)}`;
}

const STATUS_STYLES: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  paid: {
    label: "Paid",
    className: "border-brand-500/20 bg-brand-500/10 text-brand-700",
  },
  pending: {
    label: "Pending",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  failed: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-600",
  },
  refunded: {
    label: "Refunded",
    className: "border-slate-200 bg-slate-50 text-ink-700",
  },
};

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  jcb: "JCB",
  "diners-club": "Diners Club",
  unionpay: "UnionPay",
  maestro: "Maestro",
};

function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${style.className}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {style.label}
    </span>
  );
}

function ViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-700 transition-colors hover:border-brand-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      View
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Details modal                                                              */
/* -------------------------------------------------------------------------- */

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium tracking-[0.06em] text-ink-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] text-ink-900">{value}</dd>
    </div>
  );
}

function TransactionDetails({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const subtotal = transaction.items.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const method = transaction.method
    ? `${BRAND_LABELS[transaction.method.brand] ?? transaction.method.brand} •••• ${transaction.method.last4}`
    : "No payment method";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-ink-900">
              Invoice {transaction.invoiceNo}
            </h2>
            <div className="mt-1.5">
              <TransactionStatusBadge status={transaction.status} />
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close invoice details"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-2 gap-4">
            <DetailRow
              label="Amount"
              value={
                <span className="font-semibold">
                  {formatMoney(transaction.amount)}
                </span>
              }
            />
            <DetailRow
              label="Payment plan"
              value={`${transaction.plan} · ${
                transaction.cycle === "annual" ? "Annual" : "Monthly"
              }`}
            />
            <DetailRow
              label="Created"
              value={createdAtFormat.format(new Date(transaction.createdAt))}
            />
            <DetailRow label="Payment method" value={method} />
            <DetailRow label="Billed to" value={transaction.email} />
            <DetailRow
              label="Billing period"
              value={`${dateFormat.format(
                new Date(transaction.periodStart),
              )} – ${dateFormat.format(new Date(transaction.periodEnd))}`}
            />
          </dl>

          <div className="mt-5">
            <h3 className="text-[12px] font-semibold text-ink-900">
              What you paid for
            </h3>

            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {transaction.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-ink-900">
                      {item.label}
                    </p>
                    {item.description ? (
                      <p className="mt-0.5 text-[11.5px] text-ink-400">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[12.5px] text-ink-900 tabular-nums">
                    {formatMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="text-ink-900 tabular-nums">
                  {formatMoney(subtotal)}
                </dd>
              </div>

              {transaction.discount ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">{transaction.discount.label}</dt>
                  <dd className="text-brand-700 tabular-nums">
                    −{formatMoney(transaction.discount.amount)}
                  </dd>
                </div>
              ) : null}

              {transaction.tax ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Tax</dt>
                  <dd className="text-ink-900 tabular-nums">
                    {formatMoney(transaction.tax)}
                  </dd>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-line pt-2 text-[13px] font-semibold">
                <dt className="text-ink-900">
                  {transaction.status === "paid" ? "Total paid" : "Total"}
                </dt>
                <dd className="text-ink-900 tabular-nums">
                  {formatMoney(transaction.amount)}
                </dd>
              </div>
            </dl>
          </div>

          {transaction.status !== "paid" ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
              {transaction.status === "pending"
                ? "This payment is still processing. We'll email you once the card is charged."
                : transaction.status === "failed"
                  ? "This payment didn't go through — no money was taken. Update your card and try again."
                  : "This payment was refunded. Refunds can take 5–10 business days to appear."}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Transaction history — invoice number, status, amount, plan and date, with a
 * View action that opens the invoice breakdown.
 */
export function BillingTransaction({
  transactions = TRANSACTIONS,
}: {
  transactions?: Transaction[];
}) {
  const [selected, setSelected] = useState<Transaction | null>(null);

  return (
    <section className="rounded-xl border border-line bg-white shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-900">
            Transactions
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Every invoice for this workspace, and what it paid for.
          </p>
        </div>

        <span className="text-[11.5px] text-ink-400">
          {transactions.length}{" "}
          {transactions.length === 1 ? "invoice" : "invoices"}
        </span>
      </header>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">Margo billing transactions</caption>

          <thead>
            <tr className="border-b border-line">
              {[
                "Invoice No",
                "Status",
                "Amount",
                "Payment plan",
                "Created",
                "Action",
              ].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="border-b border-line transition-colors last:border-0 hover:bg-slate-50/70"
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-[13px] font-medium whitespace-nowrap text-ink-900"
                >
                  {transaction.invoiceNo}
                </th>

                <td className="px-4 py-3">
                  <TransactionStatusBadge status={transaction.status} />
                </td>

                <td className="px-4 py-3 text-[13px] font-medium text-ink-900 tabular-nums">
                  {formatMoney(transaction.amount)}
                </td>

                <td className="px-4 py-3 text-[13px] text-ink-700">
                  {transaction.plan}
                  <span className="ml-1.5 text-[11.5px] text-ink-400">
                    {transaction.cycle === "annual" ? "Annual" : "Monthly"}
                  </span>
                </td>

                <td className="px-4 py-3 text-[12.5px] whitespace-nowrap text-ink-500">
                  {dateFormat.format(new Date(transaction.createdAt))}
                </td>

                <td className="px-4 py-3 text-right">
                  <ViewButton onClick={() => setSelected(transaction)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line sm:hidden">
        {transactions.map((transaction) => (
          <li key={transaction.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink-900">
                  {transaction.invoiceNo}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-400">
                  {dateFormat.format(new Date(transaction.createdAt))}
                </p>
              </div>
              <TransactionStatusBadge status={transaction.status} />
            </div>

            <div className="mt-2.5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink-900 tabular-nums">
                  {formatMoney(transaction.amount)}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-500">
                  {transaction.plan} ·{" "}
                  {transaction.cycle === "annual" ? "Annual" : "Monthly"}
                </p>
              </div>
              <ViewButton onClick={() => setSelected(transaction)} />
            </div>
          </li>
        ))}
      </ul>

      {selected ? (
        <TransactionDetails
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
