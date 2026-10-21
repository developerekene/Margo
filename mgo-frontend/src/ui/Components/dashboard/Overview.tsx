import { useMemo, useState } from "react";

import { LuSearch } from "react-icons/lu";

import { CompanyDetailsModal, ConversationModal } from "./CompanyDetailsModal";
import {
  CompanyTable,
  ConversationTable,
  type Company,
  type Conversation,
} from "./CompanyTable";
import { MetricCard } from "./MetricCard";
import {
  COMPANIES,
  CONVERSATIONS,
  METRICS,
  REVENUE,
  FEATURED_METRIC,
  COMPANYMETRICS,
} from "./mockdata";

/** Overview — headline metrics plus a searchable company list. */
export function Overview() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return COMPANIES;

    return COMPANIES.filter((company) =>
      company.name.toLowerCase().includes(term),
    );
  }, [query]);

  return (
    <div className="space-y-5">
      <div className="">
        for margo staffs
        {/* Metrics — revenue card leads, the other four sit beside it and it onlt for the margo staffs */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <MetricCard featured {...REVENUE} />

          <div className="grid gap-4 sm:grid-cols-2">
            {METRICS.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </div>

      <div className="">
        for company staffs
        {/* Metrics — revenue card leads, the other four sit beside it and it onlt for the margo staffs */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <MetricCard featured {...FEATURED_METRIC} />

          <div className="grid gap-4 sm:grid-cols-2">
            {COMPANYMETRICS.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </div>

      {/* Companies */}
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Companies
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Sample data for layout preview.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <LuSearch
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies..."
              aria-label="Search companies"
              className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="border-t border-line">
          {filtered.length ? (
            <CompanyTable companies={filtered} onView={setSelected} />
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No companies match “{query.trim()}”.
            </p>
          )}
        </div>
      </section>

      {/* company table  */}

      <ConversationsSection />

      {selected ? (
        <CompanyDetailsModal
          company={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Recent visitor conversations.
 *
 * It owns its own search and selection state rather than leaning on the company
 * table's, so the two sections stay independent. Rows come from `CONVERSATIONS`
 * in `mockdata.ts` — sample data only, nothing is fetched yet; swap that import
 * for the API call when the backend is ready. The search matches the visitor id
 * or the opening message, and "View" opens `ConversationModal` with the full
 * transcript for that visitor.
 */
function ConversationsSection() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return CONVERSATIONS;

    return CONVERSATIONS.filter(
      (conversation) =>
        conversation.visitorId.toLowerCase().includes(term) ||
        conversation.firstMessage.toLowerCase().includes(term),
    );
  }, [query]);

  return (
    <>
      {/* Conversations */}
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Recent conversations
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Sample data for layout preview.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <LuSearch
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="border-t border-line">
          {filtered.length ? (
            <ConversationTable conversations={filtered} onView={setSelected} />
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No conversations match “{query.trim()}”.
            </p>
          )}
        </div>
      </section>

      {selected ? (
        <ConversationModal
          conversation={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
