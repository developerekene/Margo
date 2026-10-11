import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { ChatbotConfig } from "../../ui/pages/chatbotdata";
import { chatbotConfig } from "../../ui/pages/chatbotdata";

/**
 * Widget settings the Agent page edits. Starts from the defaults in
 * `chatbotdata.ts` and is applied live by the chat widget, so a change here
 * shows up on `/chatbot` immediately.
 */
const initialState: ChatbotConfig = chatbotConfig;

const agentSlice = createSlice({
  name: "agent",
  initialState,

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

export default agentSlice.reducer;
