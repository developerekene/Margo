import { useLayoutEffect } from "react";
import { useDispatch } from "react-redux";

import { agentUpdated, loadAgents } from "../../Redux/Slices/agentslic";
import { welcomeMessageChanged } from "../../Redux/Slices/chatslic";
import Chatbot from "./Chatbot";
import type { ChatbotConfig } from "./chatbotdata";

/** Reads the demo workspace's saved agent settings, when the visitor has them. */
function readSavedConfig(): Partial<ChatbotConfig> | null {
  const saved = localStorage.getItem("margo:agent:demo");
  if (!saved) return null;

  try {
    return JSON.parse(saved) as Partial<ChatbotConfig>;
  } catch (error) {
    console.error("Unable to load Margo settings:", error);
    return null;
  }
}

export default function Chatbotembed() {
  const dispatch = useDispatch();

  // Applied before the first paint, so the widget never flashes the defaults.
  useLayoutEffect(() => {
    const chatbotId = new URLSearchParams(window.location.search).get(
      "chatbotId",
    );
    if (!chatbotId) return;

    // Each saved agent embeds its own id; "demo" keeps the legacy behaviour.
    const agent = loadAgents().find((item) => item.id === chatbotId);
    const config =
      agent?.config ?? (chatbotId === "demo" ? readSavedConfig() : null);
    if (!config) return;

    dispatch(agentUpdated(config));

    if (typeof config.welcomeMessage === "string") {
      dispatch(welcomeMessageChanged(config.welcomeMessage));
    }
  }, [dispatch]);

  return <Chatbot />;
}
