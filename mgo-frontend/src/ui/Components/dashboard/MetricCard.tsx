import type { IconType } from "react-icons";
import { LuArrowUpRight } from "react-icons/lu";

type MetricCardProps = {
  label: string;
  value: string;
  /** Small print under the value, e.g. the period it covers. */
  hint?: string;
  /** Percentage change with an upward arrow, e.g. "+12.4%". */
  change?: string;
  icon: IconType;
  /** The larger card used for the headline metric. */
  featured?: boolean;
};

/** One metric at a glance — `featured` renders the taller revenue variant. */
export function MetricCard({
  label,
  value,
  hint,
  change,
  icon: Icon,
  featured = false,
}: MetricCardProps) {
  return (
    <section
      className={`flex h-full flex-col justify-between rounded-xl border border-line bg-white shadow-soft ${
        featured ? "p-5" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase">
          {label}
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className={featured ? "mt-6" : "mt-3"}>
        <p
          className={`font-semibold tracking-tight text-ink-900 ${
            featured ? "text-[32px]" : "text-[22px]"
          }`}
        >
          {value}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {change ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand-700">
              <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              {change}
            </span>
          ) : null}

          {hint ? <span className="text-[12px] text-ink-400">{hint}</span> : null}
        </div>
      </div>
    </section>
  );
}
