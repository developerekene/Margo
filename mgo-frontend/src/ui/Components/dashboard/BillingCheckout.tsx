import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { createPortal } from "react-dom";
import * as Flags from "country-flag-icons/react/3x2";
import creditCardType from "credit-card-type";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import type { IconType } from "react-icons";
import {
  LuArrowLeft,
  LuBot,
  LuCheck,
  LuChevronDown,
  LuCreditCard,
  LuGlobe,
  LuLayoutDashboard,
  LuMapPin,
  LuMessageSquare,
  LuSearch,
  LuUsers,
  LuX,
} from "react-icons/lu";

/* -------------------------------------------------------------------------- */
/* Countries                                                                  */
/* -------------------------------------------------------------------------- */

countries.registerLocale(en);

type CountryOption = { code: string; name: string };

/** Every ISO 3166-1 country the locale knows about — nothing hardcoded. */
const COUNTRY_OPTIONS: CountryOption[] = Object.entries(
  countries.getNames("en", { select: "official" }),
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Use the browser's region when the list knows it, else Nigeria. */
function defaultCountryCode() {
  const region = navigator.language.split("-")[1]?.toUpperCase();

  return region && COUNTRY_OPTIONS.some((country) => country.code === region)
    ? region
    : "NG";
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type BillingCycle = "monthly" | "annual";

/** `credit-card-type` id — e.g. "visa", "amex", "unionpay", "maestro". */
export type CardBrand = string;

/** Only the safe parts of a card ever leave the card modal. */
export type CardData = {
  brand: CardBrand;
  /** Human-readable brand name from `credit-card-type` (e.g. "Amex"). */
  label: string;
  last4: string;
};

/** The subset of a plan this flow needs (structurally matches `BillingPlan`). */
export type CheckoutPlan = {
  id: string;
  name: string;
  /** Monthly price per agent. */
  price: number;
  description: string;
  features: Record<string, string | boolean>;
};

export type SubscriptionSummary = {
  planName: string;
  cycle: BillingCycle;
  last4: string;
  brand: CardBrand;
  brandLabel: string;
};

type PlanCheckoutProps = {
  plan: CheckoutPlan;
  /** Annual discount applied to the monthly price. */
  discountPercent: number;
  /** Read-only contact email shown in the form. */
  email: string;
  onClose: () => void;
  onSubscribed: (summary: SubscriptionSummary) => void;
};

/* -------------------------------------------------------------------------- */
/* Card helpers                                                               */
/* -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatMoney(value: number) {
  return `$${money.format(value)}`;
}

/** "$39" for whole amounts, "$421.20" otherwise. */
function formatShortMoney(value: number) {
  return `$${Number.isInteger(value) ? value : money.format(value)}`;
}

/** Start of the next billing period, one month from today. */
function nextBillingDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return dateLabel.format(date);
}

/** Charge for the remainder of the current month. */
function proratedToday(monthlyPrice: number) {
  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);

  return (monthlyPrice / daysInMonth) * remainingDays;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** "4242424242424242" -> "4242 4242 4242 4242" */
function formatCardNumber(value: string) {
  const digits = digitsOnly(value).slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1229" -> "12/29" */
function formatExpiry(value: string) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function detectCard(value: string): { brand: CardBrand; label: string } {
  const digits = digitsOnly(value);
  if (!digits) return { brand: "unknown", label: "" };

  const [match] = creditCardType(digits);

  return match
    ? { brand: match.type, label: match.niceType }
    : { brand: "unknown", label: "" };
}

function luhnValid(value: string) {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

function expiryValid(value: string) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return false;

  const year = 2000 + Number(match[2]);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  return endOfMonth >= new Date();
}

function iconForFeature(key: string): IconType {
  const lower = key.toLowerCase();

  if (lower.includes("conversation") || lower.includes("chat")) {
    return LuMessageSquare;
  }
  if (
    lower.includes("seat") ||
    lower.includes("team") ||
    lower.includes("user")
  ) {
    return LuUsers;
  }
  if (lower.includes("analytic") || lower.includes("dashboard")) {
    return LuLayoutDashboard;
  }
  if (
    lower.includes("ai") ||
    lower.includes("captain") ||
    lower.includes("bot")
  ) {
    return LuBot;
  }
  if (lower.includes("channel") || lower.includes("domain")) {
    return LuGlobe;
  }

  return LuCheck;
}

/* -------------------------------------------------------------------------- */
/* Modal (portal + focus trap + scroll lock)                                   */
/* -------------------------------------------------------------------------- */

let scrollLocks = 0;
let previousOverflow = "";

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (scrollLocks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLocks += 1;

    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  /** Backdrop 40, plan modal 50, card modal 60. */
  zIndex: number;
  /** Only the top-most modal reacts to Esc and traps Tab. */
  isTopMost?: boolean;
  backdropClassName?: string;
  panelClassName?: string;
  children: ReactNode;
};

function Modal({
  open,
  onClose,
  labelledBy,
  zIndex,
  isTopMost = true,
  backdropClassName = "bg-slate-900/45",
  panelClassName = "",
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);

  // Move focus into the dialog on open and return it to the trigger on close.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    return () => previous?.focus?.();
  }, [open]);

  // Esc closes the top-most dialog and Tab stays inside it.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopMost || !panel) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);

      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && (active === lastNode || !panel.contains(active))) {
        event.preventDefault();
        firstNode.focus();
      } else if (
        event.shiftKey &&
        (active === firstNode || !panel.contains(active))
      ) {
        event.preventDefault();
        lastNode.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isTopMost, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
      style={{ zIndex }}
    >
      <style>{`
        @keyframes margo-modal-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes margo-modal-pop { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>

      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 animate-[margo-modal-fade_180ms_ease-out] ${backdropClassName}`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full animate-[margo-modal-pop_180ms_ease-out] outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

const FLOATING_INPUT =
  "peer h-[52px] w-full rounded-xl border-2 border-transparent bg-slate-100 px-3.5 pt-4 pb-1.5 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-transparent focus:border-ink-900 focus:bg-white";

const FLOATING_LABEL =
  "pointer-events-none absolute top-1.5 left-3.5 text-[11px] font-medium text-ink-400 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-[13.5px] peer-focus:top-1.5 peer-focus:text-[11px]";

type FloatingInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "numeric";
  autoComplete?: string;
  maxLength?: number;
  error?: string;
  trailing?: ReactNode;
  className?: string;
};

function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  error,
  trailing,
  className = "",
}: FloatingInputProps) {
  const id = useId();

  return (
    <div className={className}>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          placeholder=" "
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${FLOATING_INPUT} ${error ? "border-red-400" : ""} ${
            trailing ? "pr-16" : ""
          }`}
        />

        <label htmlFor={id} className={FLOATING_LABEL}>
          {label}
        </label>

        {trailing ? (
          <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
            {trailing}
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[11.5px] text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CountryFlag({ code }: { code: string }) {
  const Flag = Flags[code as keyof typeof Flags];

  if (!Flag) {
    return <span className="h-3.5 w-5 shrink-0 rounded-[2px] bg-slate-200" />;
  }

  return (
    <Flag
      aria-hidden="true"
      className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10"
    />
  );
}

/** Where the floating country panel should sit, given its trigger. */
function panelPosition(trigger: HTMLElement | null) {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return null;

  const spaceBelow = window.innerHeight - rect.bottom;
  const height = Math.min(300, window.innerHeight - 24);

  return {
    top:
      spaceBelow < 320 ? Math.max(12, rect.top - height - 6) : rect.bottom + 6,
    left: rect.left,
    width: Math.max(rect.width, 240),
  };
}

/** Searchable country picker with SVG flags, rendered above the modals. */
function CountrySelect({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const labelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240 });

  const selected = COUNTRY_OPTIONS.find((country) => country.code === value);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? COUNTRY_OPTIONS.filter(
        (country) =>
          country.name.toLowerCase().includes(normalized) ||
          country.code.toLowerCase().includes(normalized),
      )
    : COUNTRY_OPTIONS;

  function openPanel() {
    const next = panelPosition(triggerRef.current);
    if (next) setPosition(next);

    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        COUNTRY_OPTIONS.findIndex((country) => country.code === value),
      ),
    );
    setOpen(true);
  }

  function selectCountry(code: string) {
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Keep the panel anchored while the modal scrolls or the window resizes.
  useEffect(() => {
    if (!open) return;

    function reposition() {
      const next = panelPosition(triggerRef.current);
      if (next) setPosition(next);
    }

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // Click-outside and Escape close only the picker, not the modal underneath.
  useEffect(() => {
    if (!open) return;

    searchRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <div className={className}>
      <span
        id={labelId}
        className="mb-1.5 block text-[12px] font-medium text-ink-700"
      >
        {label}
      </span>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openPanel();
          }
        }}
        className="flex h-[52px] w-full items-center gap-2 rounded-xl border-2 border-transparent bg-slate-100 px-3.5 text-left transition-colors hover:bg-slate-200/60 focus:border-ink-900 focus:bg-white focus-visible:outline-none"
      >
        <LuMapPin
          className="h-4 w-4 shrink-0 text-ink-400"
          aria-hidden="true"
        />
        {selected ? <CountryFlag code={selected.code} /> : null}
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-900">
          {selected?.name ?? "Select a country"}
        </span>
        <LuChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
              }}
              className="fixed z-[70] overflow-hidden rounded-xl border border-line bg-white shadow-xl"
            >
              <div className="border-b border-line p-2">
                <div className="relative">
                  <LuSearch
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveIndex((index) =>
                          Math.min(filtered.length - 1, index + 1),
                        );
                        return;
                      }

                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveIndex((index) => Math.max(0, index - 1));
                        return;
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        const picked = filtered[activeIndex];
                        if (picked) selectCountry(picked.code);
                      }
                    }}
                    placeholder="Search countries"
                    aria-label="Search countries"
                    className="h-9 w-full rounded-lg bg-slate-100 pr-2.5 pl-8 text-[12.5px] text-ink-900 caret-brand-500 outline-none placeholder:text-ink-400 focus:bg-white focus:ring-2 focus:ring-ink-900/10"
                  />
                </div>
              </div>

              <ul
                role="listbox"
                aria-labelledby={labelId}
                className="max-h-56 overflow-y-auto p-1"
              >
                {filtered.map((country, index) => {
                  const isSelected = country.code === value;

                  return (
                    <li key={country.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => selectCountry(country.code)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                          index === activeIndex ? "bg-slate-100" : ""
                        } ${
                          isSelected
                            ? "font-semibold text-ink-900"
                            : "text-ink-700"
                        }`}
                      >
                        <CountryFlag code={country.code} />
                        <span className="min-w-0 flex-1 truncate">
                          {country.name}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-ink-400">
                          {country.code}
                        </span>
                      </button>
                    </li>
                  );
                })}

                {filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-[12px] text-ink-400">
                    No countries match “{query}”.
                  </li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card brand mark                                                            */
/* -------------------------------------------------------------------------- */

/** Short labels for brands whose `niceType` is too wide for the badge. */
const BRAND_LABELS: Record<string, string> = {
  amex: "Amex",
  "diners-club": "Diners",
  unionpay: "UnionPay",
  hipercard: "Hipercard",
  mastercard: "Mastercard",
};

const BRAND_STYLES: Record<string, string> = {
  visa: "bg-[#1a1f71] text-white",
  amex: "bg-[#2e77bc] text-white",
  discover: "bg-[#f1f1f1] text-[#4a4a4a]",
  jcb: "bg-white text-[#0b4ea2] ring-1 ring-line",
  "diners-club": "bg-[#0079be] text-white",
  unionpay: "bg-[#e21836] text-white",
  maestro: "bg-[#0099cc] text-white",
  elo: "bg-ink-900 text-[#ffe100]",
  mir: "bg-[#0f754e] text-white",
  hiper: "bg-[#f5a623] text-white",
  hipercard: "bg-[#b3131b] text-white",
};

function BrandMark({ brand, label }: { brand: CardBrand; label?: string }) {
  if (brand === "mastercard") {
    return (
      <span className="flex items-center" aria-label="Mastercard">
        <span className="h-3.5 w-3.5 rounded-full bg-[#eb001b]" />
        <span className="-ml-1.5 h-3.5 w-3.5 rounded-full bg-[#f79e1b]" />
      </span>
    );
  }

  if (!brand || brand === "unknown") {
    return <LuCreditCard className="h-4 w-4 text-ink-400" aria-hidden="true" />;
  }

  const text = (BRAND_LABELS[brand] ?? label ?? brand).toUpperCase();

  return (
    <span
      title={label || brand}
      className={`max-w-[68px] truncate rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${
        BRAND_STYLES[brand] ?? "bg-slate-200 text-ink-700"
      }`}
    >
      {text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan option                                                                */
/* -------------------------------------------------------------------------- */

function PlanOption({
  title,
  price,
  period = "/mo",
  hint,
  badge,
  selected,
  muted,
  onSelect,
}: {
  title: string;
  price: number;
  /** Billing period shown next to the price. */
  period?: string;
  /** Small secondary line under the price. */
  hint?: string;
  badge?: string;
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative flex-1 rounded-2xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 ${
        selected
          ? "border-ink-900 bg-white"
          : muted
            ? "border-transparent bg-slate-50 hover:bg-slate-100"
            : "border-transparent bg-white hover:bg-slate-50"
      }`}
    >
      <span className="block text-[12.5px] font-semibold text-ink-900">
        {title}
      </span>

      <span className="mt-1 flex items-baseline gap-1">
        <span className="text-[20px] leading-none font-bold text-ink-900">
          {formatShortMoney(price)}
        </span>
        <span className="text-[11.5px] text-ink-500">{period}</span>
      </span>

      {hint ? (
        <span className="mt-1 block text-[10.5px] text-ink-400">{hint}</span>
      ) : null}

      {badge ? (
        <span className="absolute top-3 right-3 rounded-full bg-blue-600 px-2 py-0.5 text-[9.5px] font-semibold tracking-wide text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Order summary                                                              */
/* -------------------------------------------------------------------------- */

function OrderSummary({
  plan,
  cycle,
  monthlyPrice,
  discountPercent,
  card,
  onSubscribe,
}: {
  plan: CheckoutPlan;
  cycle: BillingCycle;
  monthlyPrice: number;
  discountPercent: number;
  card: CardData | null;
  onSubscribe: () => void;
}) {
  const conversations =
    typeof plan.features.Conversations === "string"
      ? plan.features.Conversations
      : "Unlimited";

  const topFeatures = Object.entries(plan.features)
    .filter(([, value]) => value !== false)
    .slice(0, 5);

  const annualMonthly = monthlyPrice * (1 - discountPercent / 100);
  const annualTotal = annualMonthly * 12;
  const isAnnual = cycle === "annual";
  const price = isAnnual ? annualTotal : monthlyPrice;
  const dueToday = isAnnual ? annualTotal : proratedToday(monthlyPrice);

  return (
    <div
      className="rounded-2xl border border-blue-100 p-4 sm:p-5"
      style={{
        backgroundImage: "linear-gradient(180deg, #eef6ff 0%, #f8fbff 100%)",
      }}
    >
      <h3 className="text-[14px] font-semibold text-ink-900">
        {plan.name} plan
      </h3>
      <p className="mt-0.5 text-[11.5px] text-ink-500">
        {conversations} conversations / month
      </p>
      <p className="text-[11.5px] text-ink-500">then $50 per 100</p>

      <div className="mt-4 border-t border-blue-100 pt-3">
        <p className="text-[10.5px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
          Top features
        </p>

        <ul className="mt-2 space-y-2">
          {topFeatures.map(([key, value]) => {
            const Icon = iconForFeature(key);

            return (
              <li
                key={key}
                className="flex items-start gap-2 text-[12px] text-ink-700"
              >
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  {key}
                  {typeof value === "string" ? (
                    <span className="text-ink-500"> · {value}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-blue-100 pt-3 text-[12px]">
        <div className="flex items-start justify-between gap-3">
          <span className="text-ink-500">
            {plan.name} plan, from {nextBillingDate()}
          </span>
          <span className="shrink-0 text-ink-900">
            {formatMoney(price)}
            {isAnnual ? "/year" : "/mo"}
          </span>
        </div>

        {isAnnual ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-500">Annual billing</span>
            <span className="shrink-0 text-brand-700">
              Save {formatMoney(monthlyPrice * 12 - annualTotal)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-500 underline decoration-dotted underline-offset-2">
              Prorated for today
            </span>
            <span className="shrink-0 text-ink-900">
              {formatMoney(dueToday)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1.5 text-[13px] font-semibold text-ink-900">
          <span>Due today</span>
          <span>{formatMoney(dueToday)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={!card}
        onClick={onSubscribe}
        className="mt-4 w-full rounded-xl bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-ink-400 disabled:hover:bg-slate-200"
      >
        Subscribe
      </button>

      {!card ? (
        <p className="mt-2 text-center text-[11px] text-ink-400">
          Add a payment method to subscribe.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal 1 — Configure your plan                                              */
/* -------------------------------------------------------------------------- */

const ADDRESS_FIELDS = ["Country", "Address line 1", "Address line 2"];

function ConfigurePlanModal({
  plan,
  discountPercent,
  email,
  card,
  isCardOpen,
  onClose,
  onAutofill,
  onSubscribe,
}: {
  plan: CheckoutPlan;
  discountPercent: number;
  email: string;
  card: CardData | null;
  isCardOpen: boolean;
  onClose: () => void;
  onAutofill: () => void;
  onSubscribe: (cycle: BillingCycle) => void;
}) {
  const titleId = useId();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [name, setName] = useState("");
  const [country, setCountry] = useState(defaultCountryCode);
  const [address, setAddress] = useState("");
  const [addressExtra, setAddressExtra] = useState("");

  const annualMonthly = plan.price * (1 - discountPercent / 100);
  const annualTotal = annualMonthly * 12;

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy={titleId}
      zIndex={50}
      isTopMost={!isCardOpen}
      panelClassName="max-h-[92dvh] overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-[1000px] sm:rounded-3xl"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <LuArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <h2
              id={titleId}
              className="truncate text-[15px] font-semibold text-ink-900 sm:text-[16px]"
            >
              Configure your plan
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-6 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Form */}
            <div className="min-w-0">
              <section>
                <h3 className="text-[12.5px] font-semibold text-ink-900">
                  Plan details
                </h3>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <PlanOption
                    title="Monthly billing"
                    price={plan.price}
                    period="/mo"
                    selected={cycle === "monthly"}
                    onSelect={() => setCycle("monthly")}
                  />
                  <PlanOption
                    title="Annual billing"
                    price={annualTotal}
                    period="/year"
                    hint={`${formatShortMoney(annualMonthly)}/mo billed yearly`}
                    badge={
                      discountPercent > 0
                        ? `SAVE ${discountPercent}%`
                        : undefined
                    }
                    selected={cycle === "annual"}
                    muted
                    onSelect={() => setCycle("annual")}
                  />
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-[12.5px] font-semibold text-ink-900">
                  Contact information
                </h3>

                <div className="mt-2 rounded-xl bg-slate-100 px-3.5 py-2.5">
                  <p className="text-[10.5px] font-medium text-ink-400">
                    Email
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-ink-900">
                    {email || "you@company.com"}
                  </p>
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-[12.5px] font-semibold text-ink-900">
                  1. Payment method
                </h3>

                <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 focus-within:bg-white">
                  <LuCreditCard
                    className="h-4 w-4 shrink-0 text-ink-400"
                    aria-hidden="true"
                  />

                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      card ? "text-ink-900" : "text-ink-400"
                    }`}
                    aria-label={
                      card ? `Card ending ${card.last4}` : "No card added"
                    }
                  >
                    {card ? `•••• •••• •••• ${card.last4}` : "Card number"}
                  </span>

                  {card ? (
                    <BrandMark brand={card.brand} label={card.label} />
                  ) : (
                    <button
                      type="button"
                      onClick={onAutofill}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="h-3 w-3 text-emerald-400"
                      >
                        <path
                          d="M2.5 8h11M9.5 4l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Autofill
                    </button>
                  )}
                </div>
              </section>

              <section className="mt-5">
                <h3 className="text-[12.5px] font-semibold text-ink-900">
                  2. Billing address
                </h3>

                <div className="mt-2 space-y-2">
                  <FloatingInput
                    label="Full name"
                    value={name}
                    autoComplete="name"
                    onChange={setName}
                  />

                  <CountrySelect
                    label="Country or region"
                    value={country}
                    onChange={setCountry}
                  />

                  <FloatingInput
                    label={ADDRESS_FIELDS[1]}
                    value={address}
                    autoComplete="address-line1"
                    onChange={setAddress}
                  />

                  <FloatingInput
                    label={ADDRESS_FIELDS[2]}
                    value={addressExtra}
                    autoComplete="address-line2"
                    onChange={setAddressExtra}
                  />
                </div>
              </section>
            </div>

            {/* Summary */}
            <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <OrderSummary
                plan={plan}
                cycle={cycle}
                monthlyPrice={plan.price}
                discountPercent={discountPercent}
                card={card}
                onSubscribe={() => onSubscribe(cycle)}
              />
            </aside>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal 2 — Add a card                                                       */
/* -------------------------------------------------------------------------- */

function AddCardModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (card: CardData) => void;
}) {
  const titleId = useId();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [country, setCountry] = useState(defaultCountryCode);
  const [name, setName] = useState("");

  const detected = detectCard(number);
  const numberValid = luhnValid(number);
  const formValid =
    numberValid &&
    expiryValid(expiry) &&
    /^\d{3,4}$/.test(cvc) &&
    name.trim().length >= 2 &&
    country.length > 0;

  function handleSubmit() {
    if (!formValid) return;

    const safeCard: CardData = {
      brand: detected.brand,
      label: detected.label,
      last4: digitsOnly(number).slice(-4),
    };

    // Drop the raw card details before handing control back.
    setNumber("");
    setExpiry("");
    setCvc("");
    onSubmit(safeCard);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      zIndex={60}
      backdropClassName="bg-slate-900/30"
      panelClassName="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-[360px] sm:rounded-3xl"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
            >
              <path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <h2 id={titleId} className="text-[14px] font-semibold text-ink-900">
            Add a card
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuX className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          className="mt-5 space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <FloatingInput
            label="Card number"
            value={number}
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={23}
            onChange={(value) => setNumber(formatCardNumber(value))}
            error={
              number.length >= 12 && !numberValid
                ? "Enter a valid card number."
                : undefined
            }
            trailing={
              <BrandMark brand={detected.brand} label={detected.label} />
            }
          />

          <div className="grid grid-cols-2 gap-2.5">
            <FloatingInput
              label="Expiration"
              value={expiry}
              inputMode="numeric"
              autoComplete="cc-exp"
              maxLength={5}
              onChange={(value) => setExpiry(formatExpiry(value))}
              error={
                expiry.length === 5 && !expiryValid(expiry)
                  ? "Invalid date."
                  : undefined
              }
            />

            <FloatingInput
              label="CVC"
              value={cvc}
              inputMode="numeric"
              autoComplete="cc-csc"
              maxLength={4}
              onChange={(value) => setCvc(digitsOnly(value).slice(0, 4))}
            />
          </div>

          <CountrySelect
            label="Country or region"
            value={country}
            onChange={setCountry}
          />

          <FloatingInput
            label="Full name"
            value={name}
            autoComplete="name"
            onChange={setName}
            error={name.length === 1 ? "Enter the cardholder name." : undefined}
          />

          <p className="pt-1 text-[10.5px] leading-relaxed text-ink-400">
            By continuing, you agree to create a Link account subject to the{" "}
            <span className="font-semibold text-ink-700 underline underline-offset-2">
              Terms
            </span>{" "}
            and{" "}
            <span className="font-semibold text-ink-700 underline underline-offset-2">
              Privacy Policy
            </span>
            .
          </p>

          <button
            type="submit"
            disabled={!formValid}
            className="w-full rounded-xl bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-ink-400 disabled:hover:bg-slate-200"
          >
            Continue
          </button>
        </form>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Flow                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Stacked billing flow: "Configure your plan" with an "Add a card" modal on top.
 * Only the masked card (brand + last four digits) is lifted into state.
 */
export function PlanCheckout({
  plan,
  discountPercent,
  email,
  onClose,
  onSubscribed,
}: PlanCheckoutProps) {
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);

  return (
    <>
      <ConfigurePlanModal
        plan={plan}
        discountPercent={discountPercent}
        email={email}
        card={cardData}
        isCardOpen={isCardModalOpen}
        onClose={onClose}
        onAutofill={() => setIsCardModalOpen(true)}
        onSubscribe={(cycle) => {
          if (!cardData) return;

          onSubscribed({
            planName: plan.name,
            cycle,
            last4: cardData.last4,
            brand: cardData.brand,
            brandLabel: cardData.label,
          });
        }}
      />

      {isCardModalOpen ? (
        <AddCardModal
          open
          onClose={() => setIsCardModalOpen(false)}
          onSubmit={(card) => {
            setCardData(card);
            setIsCardModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
