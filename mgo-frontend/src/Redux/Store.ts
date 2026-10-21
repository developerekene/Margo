import { configureStore } from "@reduxjs/toolkit";
import agentReducer, {
  agentsReducer,
  persistAgents,
} from "./Slices/agentslic";
import authReducer from "./Slices/authslic";
import chatReducer from "./Slices/chatslic";

export const store = configureStore({
  reducer: {
    agent: agentReducer,
    agents: agentsReducer,
    auth: authReducer,
    chat: chatReducer,
  },
});

// Persist the agent list whenever it changes, so saved agents survive a reload.
let lastAgents = store.getState().agents.items;

store.subscribe(() => {
  const items = store.getState().agents.items;
  if (items === lastAgents) return;

  lastAgents = items;
  persistAgents(items);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
