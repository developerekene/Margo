
/* this is for margo */
export type CompanyStatus = "active" | "pending" | "suspended";

export type Company = {
  id: string;
  name: string;
  plan: string;
  role: string;
  status: CompanyStatus;
  website: string;
  agents: number;
  conversations: number;
  revenue: string;
  joined: string;
};



/** Status of one visitor conversation. */
export type ConversationStatus = "active" | "resolved" | "unanswered";

export type TranscriptLine = {
  role: "visitor" | "agent";
  text: string;
  time: string;
};

/** One visitor conversation — the transcript is what the View action opens. */
export type Conversation = {
  id: string;
  visitorId: string;
  firstMessage: string;
  agent: string;
  date: string;
  time: string;
  status: ConversationStatus;
  transcript: TranscriptLine[];
};

/** Any status either table can show. */
type TableStatus = CompanyStatus | ConversationStatus;

const STATUS_STYLES: Record<
  TableStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "border-brand-500/20 bg-brand-500/10 text-brand-700",
  },
  pending: {
    label: "Pending",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  suspended: {
    label: "Suspended",
    className: "border-red-200 bg-red-50 text-red-600",
  },
  resolved: {
    label: "Resolved",
    className: "border-slate-200 bg-slate-50 text-ink-700",
  },
  unanswered: {
    label: "Unanswered",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

/** Coloured pill for a company or conversation status. */
export function StatusBadge({ status }: { status: TableStatus }) {
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

/** The row action both tables share — opens that row's details modal. */
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

type CompanyTableProps = {
  companies: Company[];
  onView: (company: Company) => void;
};

/** Presentational companies table — filtering and selection live with the caller. */
export function CompanyTable({ companies, onView }: CompanyTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["Company name", "Plan", "Role", "Status", "Action"].map(
              (column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase"
                >
                  {column}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody>
          {companies.map((company) => (
            <tr
              key={company.id}
              className="border-b border-line transition-colors last:border-0 hover:bg-slate-50/70"
            >
              <th
                scope="row"
                className="px-4 py-3 text-[13.5px] font-medium text-ink-900"
              >
                {company.name}
              </th>
              <td className="px-4 py-3 text-[13px] text-ink-700">
                {company.plan}
              </td>
              <td className="px-4 py-3 text-[13px] text-ink-700">
                {company.role}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={company.status} />
              </td>
              <td className="px-4 py-3">
                <ViewButton onClick={() => onView(company)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ConversationTableProps = {
  conversations: Conversation[];
  onView: (conversation: Conversation) => void;
};

/**
 * The conversations table — same shell as `CompanyTable`, with the visitor
 * columns: who visited, the opening message, which agent replied, when it
 * happened, the status and the View action. Presentational only, so filtering
 * and selection stay with the caller.
 */
export function ConversationTable({
  conversations,
  onView,
}: ConversationTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {[
              "Visitor ID",
              "First message",
              "AI agent",
              "Date and time",
              "Status",
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
          {conversations.map((conversation) => (
            <tr
              key={conversation.id}
              className="border-b border-line transition-colors last:border-0 hover:bg-slate-50/70"
            >
              <th
                scope="row"
                className="px-4 py-3 font-mono text-[12.5px] font-medium text-ink-900"
              >
                {conversation.visitorId}
              </th>
              <td className="max-w-[18rem] truncate px-4 py-3 text-[13px] text-ink-700">
                {conversation.firstMessage}
              </td>
              <td className="px-4 py-3 text-[13px] text-ink-700">
                {conversation.agent}
              </td>
              <td className="px-4 py-3 text-[13px] whitespace-nowrap text-ink-500">
                {conversation.date} · {conversation.time}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={conversation.status} />
              </td>
              <td className="px-4 py-3">
                <ViewButton onClick={() => onView(conversation)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
