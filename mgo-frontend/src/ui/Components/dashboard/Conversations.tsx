import { LuMessageSquare } from "react-icons/lu";

import { SectionPlaceholder } from "./SectionPlaceholder";

/** Conversations — visitor chat history. */
export function Conversations() {
  return (
    <SectionPlaceholder
      icon={LuMessageSquare}
      title="No conversations yet"
      description="Once visitors start chatting with your assistant, their conversations will appear here."
      points={["Visitor", "First message", "Status"]}
    />
  );
}
