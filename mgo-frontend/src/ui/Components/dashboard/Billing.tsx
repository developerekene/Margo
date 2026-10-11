import { LuCreditCard } from "react-icons/lu";

import { SectionPlaceholder } from "./SectionPlaceholder";

/** Billing — plan and subscription. */
export function Billing() {
  return (
    <SectionPlaceholder
      icon={LuCreditCard}
      title="You're on the Free Trial"
      description="14 days remaining. Upgrade whenever you're ready to keep your assistant live."
      points={["Free Trial", "Usage", "Invoices"]}
    />
  );
}
