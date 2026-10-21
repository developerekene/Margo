import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { ChatbotConfig } from "../../ui/pages/chatbotdata";
import { chatbotConfig } from "../../ui/pages/chatbotdata";

/* -------------------------------------------------------------------------- */
/* Live widget settings                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Widget settings the Agent page edits. Starts from the defaults in
 * `chatbotdata.ts` and is applied live by the chat widget, so a change here
 * shows up on `/chatbot` immediately.
 */
const initialWidgetState: ChatbotConfig = chatbotConfig;

const agentSlice = createSlice({
  name: "agent",
  initialState: initialWidgetState,

  reducers: {
    /** Patch one or more widget settings. */
    agentUpdated(state, action: PayloadAction<Partial<ChatbotConfig>>) {
      Object.assign(state, action.payload);
    },

    agentReset() {
      return chatbotConfig;
    },
  },
});

export const { agentUpdated, agentReset } = agentSlice.actions;

/* -------------------------------------------------------------------------- */
/* Saved agents                                                               */
/* -------------------------------------------------------------------------- */

/** Draft agents are saved but not embedded yet; published ones are live. */
export type AgentStatus = "draft" | "published";

export type KnowledgeSourceType = "website" | "file" | "faq";

/** One entry in an agent's knowledge base. Uploaded files store metadata only. */
export type KnowledgeSource = {
  id: string;
  type: KnowledgeSourceType;
  /** Hostname, file name or FAQ question. */
  label: string;
  /** URL, file details or FAQ answer. */
  value: string;
  /** File size in bytes when `type` is "file". */
  size?: number;
  addedAt: string;
};

/** One customer-created AI agent. Each agent owns its own widget settings. */
export type Agent = {
  id: string;
  name: string;
  description: string;
  website: string;
  status: AgentStatus;
  /** Tone id from the editor (`friendly`, `professional`, …). */
  personality: string;
  config: ChatbotConfig;
  /** Optional so agents saved before knowledge sources still load. */
  knowledgeSources?: KnowledgeSource[];
  createdAt: string;
  updatedAt: string;
};

type AgentsState = {
  items: Agent[];
};

const STORAGE_KEY = "margo:agents";

/** Best-effort guard so a corrupted localStorage entry cannot break the page. */
function isAgent(value: unknown): value is Agent {
  if (!value || typeof value !== "object") return false;

  const agent = value as Partial<Agent>;

  return (
    typeof agent.id === "string" &&
    typeof agent.name === "string" &&
    typeof agent.description === "string" &&
    typeof agent.website === "string" &&
    (agent.knowledgeSources === undefined ||
      Array.isArray(agent.knowledgeSources)) &&
    typeof agent.config === "object" &&
    agent.config !== null
  );
}

/** Restore agents saved by a previous session. */
export function loadAgents(): Agent[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAgent) : [];
  } catch {
    return [];
  }
}

/** Persist the list so saved agents survive a reload. */
export function persistAgents(items: Agent[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode / quota — keep the in-memory list working.
  }
}

const initialAgentsState: AgentsState = { items: loadAgents() };

const agentListSlice = createSlice({
  name: "agents",
  initialState: initialAgentsState,

  reducers: {
    /** Create or replace one agent, matched by its unique id. */
    agentSaved(state, action: PayloadAction<Agent>) {
      const index = state.items.findIndex(
        (agent) => agent.id === action.payload.id,
      );

      if (index >= 0) state.items[index] = action.payload;
      else state.items.unshift(action.payload);
    },

    agentRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((agent) => agent.id !== action.payload);
    },
  },
});

export const { agentSaved, agentRemoved } = agentListSlice.actions;

export const agentsReducer = agentListSlice.reducer;

export default agentSlice.reducer;

