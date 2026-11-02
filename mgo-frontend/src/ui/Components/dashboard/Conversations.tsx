import { useMemo, useState } from "react";

import { LuSearch } from "react-icons/lu";

import { CompanyDetailsModal, ConversationModal } from "./CompanyDetailsModal";
import {
  CompanyTable,
  ConversationTable,
  type Company,
  type Conversation,
} from "./CompanyTable";
import { COMPANIES, CONVERSATIONS } from "./mockdata";

/**
 * Conversations — the two workspace tables only: Companies and Recent
 * conversations. Search, View and the detail modals reuse the existing
 * components and mock data.
 */
export function Conversations() {
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const [conversationQuery, setConversationQuery] = useState("");
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);

  const filteredCompanies = useMemo(() => {
    const term = companyQuery.trim().toLowerCase();
    if (!term) return COMPANIES;

    return COMPANIES.filter((company) =>
      company.name.toLowerCase().includes(term),
    );
  }, [companyQuery]);

  const filteredConversations = useMemo(() => {
    const term = conversationQuery.trim().toLowerCase();
    if (!term) return CONVERSATIONS;

    return CONVERSATIONS.filter(
      (conversation) =>
        conversation.visitorId.toLowerCase().includes(term) ||
        conversation.firstMessage.toLowerCase().includes(term),
    );
  }, [conversationQuery]);

  return (
    <div className="space-y-5">
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
              value={companyQuery}
              onChange={(event) => setCompanyQuery(event.target.value)}
              placeholder="Search companies..."
              aria-label="Search companies"
              className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="border-t border-line">
          {filteredCompanies.length ? (
            <CompanyTable
              companies={filteredCompanies}
              onView={setSelectedCompany}
            />
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No companies match “{companyQuery.trim()}”.
            </p>
          )}
        </div>
      </section>

      {/* Recent conversations */}
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
              value={conversationQuery}
              onChange={(event) => setConversationQuery(event.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[13.5px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="border-t border-line">
          {filteredConversations.length ? (
            <ConversationTable
              conversations={filteredConversations}
              onView={setSelectedConversation}
            />
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No conversations match “{conversationQuery.trim()}”.
            </p>
          )}
        </div>
      </section>

      {selectedCompany ? (
        <CompanyDetailsModal
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
        />
      ) : null}

      {selectedConversation ? (
        <ConversationModal
          conversation={selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      ) : null}
    </div>
  );
}

