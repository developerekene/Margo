import { LuBookOpen, LuPlus } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { agentSaved } from "../../../Redux/Slices/agentslic";
import type { AppDispatch, RootState } from "../../../Redux/Store";
import { KnowledgeBase } from "./KnowledgeBase";

/**
 * Knowledge — workspace shortcut for the first agent's knowledge base.
 * Per-agent sources are also editable from the agent editor; both write to
 * the same `agents` slice entry.
 */
export function Knowledge() {
  const dispatch = useDispatch<AppDispatch>();
  const agent = useSelector((state: RootState) => state.agents.items[0]);

  if (!agent) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-white px-6 py-12 text-center shadow-soft">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <LuBookOpen className="h-5 w-5" aria-hidden="true" />
        </span>

        <div>
          <h2 className="text-[14px] font-semibold text-ink-900">
            No agent to teach yet
          </h2>
          <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-ink-500">
            Create your first agent, then add websites, documents and FAQs for
            it to learn from.
          </p>
        </div>

        <Link
          to="/dashboard/agent/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <LuPlus className="h-4 w-4" aria-hidden="true" />
          Create an agent
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <KnowledgeBase
        sources={agent.knowledgeSources ?? []}
        onChange={(knowledgeSources) =>
          dispatch(
            agentSaved({
              ...agent,
              knowledgeSources,
              updatedAt: new Date().toISOString(),
            }),
          )
        }
      />

      <p className="text-[11.5px] leading-relaxed text-ink-400">
        Changes save automatically to {agent.name}. Open{" "}
        <Link
          to="/dashboard/agent"
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          My Agents
        </Link>{" "}
        to edit a different agent.
      </p>
    </div>
  );
}
