import { configureStore } from "@reduxjs/toolkit";
import agentReducer, {
  agentsReducer,
  persistAgents,
} from "./Slices/agentslic";
import authReducer from "./Slices/authslic";
import billingReducer, { persistBillingSettings } from "./Slices/billingslic";
import chatReducer from "./Slices/chatslic";
import notificationsReducer from "./Slices/notificationslic";

export const store = configureStore({
  reducer: {
    agent: agentReducer,
    agents: agentsReducer,
    auth: authReducer,
    billing: billingReducer,
    chat: chatReducer,
    notifications: notificationsReducer,
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

// Persist plan limits/currency whenever an admin edits the billing catalogue.
let lastBilling = store.getState().billing;

store.subscribe(() => {
  const billing = store.getState().billing;
  if (billing === lastBilling) return;

  lastBilling = billing;
  persistBillingSettings(billing);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
