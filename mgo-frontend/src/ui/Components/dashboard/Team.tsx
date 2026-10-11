import { LuUsers } from "react-icons/lu";

import { SectionPlaceholder } from "./SectionPlaceholder";

/** Team — members and invitations. */
export function Team() {
  return (
    <SectionPlaceholder
      icon={LuUsers}
      title="It's just you for now"
      description="Invite teammates so they can help manage your assistant, knowledge, and widget."
      points={["Owners", "Admins", "Members"]}
    />
  );
}
