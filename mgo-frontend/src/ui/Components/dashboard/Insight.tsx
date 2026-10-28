import { useId, useState } from "react";

import type { IconType } from "react-icons";
import {
  LuArrowUpRight,
  LuBot,
  LuEye,
  LuGlobe,
  LuLayoutDashboard,
  LuMessageSquare,
  LuPencil,
  LuPlus,
  LuUpload,
} from "react-icons/lu";
import { Link } from "react-router-dom";

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

/** Screenshots live in `public/images/` (served from the site root). */
const SHOT = {
  myAgents: "/images/margoscreenshort1.png",
  createAgent: "/images/margoscreenshort2.png",
  knowledge: "/images/margoscreenshort3.png",
  setup: "/images/margoscreenshort4.png",
  branding: "/images/margoscreenshort5.png",
  published: "/images/margoscreenshort6.png",
  agentMenu: "/images/margoscreenshort7.png",
  embedCode: "/images/margoscreenshort8.png",
} as const;

type StartCard = {
  title: string;
  description: string;
  src: string;
  alt: string;
  caption: string;
  linkLabel: string;
  to: string;
};

const START_CARDS: StartCard[] = [
  {
    title: "Create Your Agent",
    description:
      "Give your assistant a name and define what it should help your website visitors with.",
    src: SHOT.myAgents,
    alt: "Margo My Agents page with the Create Agent button",
    caption: "Start from My Agents, then choose Create Agent.",
    linkLabel: "Create an agent",
    to: "/dashboard/agent/new",
  },
  {
    title: "Add Knowledge",
    description:
      "Connect your website, upload files, or add FAQs to help your assistant answer questions about your business.",
    src: SHOT.knowledge,
    alt: "Knowledge base panel with Website, Files and FAQ options",
    caption: "Add a website, files, or FAQs to the knowledge base.",
    linkLabel: "Open knowledge",
    to: "/dashboard/knowledge",
  },
  {
    title: "Personalize Your Assistant",
    description:
      "Customize its greeting, personality, colors, avatar, and widget position to match your brand.",
    src: SHOT.setup,
    alt: "Assistant setup panel with greeting, personality and color controls",
    caption: "Match your brand with a greeting, tone and colors.",
    linkLabel: "Personalize an agent",
    to: "/dashboard/agent",
  },
  {
    title: "Publish and Embed",
    description:
      "Publish your assistant, retrieve its embed code, and add it to your website.",
    src: SHOT.agentMenu,
    alt: "Agent card menu open with the Get Embed Code option highlighted",
    caption: "Get Embed Code lives in each agent's menu.",
    linkLabel: "Open My Agents",
    to: "/dashboard/agent",
  },
  {
    title: "Embed on your website",
    description:
      "Open My Agents, select the agent's menu, choose Get Embed Code, and follow the installation instructions.",
    src: SHOT.embedCode,
    alt: "Get embed code dialog showing the script snippet to copy",
    caption: "Paste the snippet before the closing body tag.",
    linkLabel: "Open My Agents",
    to: "/dashboard/agent",
  },
];

type Feature = {
  title: string;
  description: string;
  icon?: IconType;
  swatch?: { accent: string; background: string };
};

const FEATURES: Feature[] = [
  {
    title: "Name & description",
    description: "Identify the agent across your workspace.",
    icon: LuPencil,
  },
  {
    title: "Knowledge sources",
    description: "Website, files, and FAQs in one place.",
    icon: LuGlobe,
  },
  {
    title: "Greeting message",
    description: "Control the first message visitors see.",
    icon: LuMessageSquare,
  },
  {
    title: "Personality",
    description: "Friendly, professional, playful, or concise.",
    icon: LuBot,
  },
  {
    title: "Accent & background",
    description: "Colour the widget to match your brand.",
    swatch: { accent: "#0a756c", background: "#ffeacf" },
  },
  {
    title: "Avatar",
    description: "Pick an emoji or upload your own logo.",
    icon: LuUpload,
  },
  {
    title: "Widget position",
    description: "Place the launcher on the left or right.",
    icon: LuLayoutDashboard,
  },
  {
    title: "Live preview",
    description: "See every change before you publish.",
    icon: LuEye,
  },
];

const FAQS = [
  {
    question: "How do I create an agent?",
    answer:
      "Open My Agents and choose Create Agent. Give your assistant a name and a short description, add knowledge, then publish it.",
  },
  {
    question: "What information can my agent learn from?",
    answer:
      "You can add a website URL, upload files such as PDFs and Markdown, or write FAQs. Combine as many sources as you need.",
  },
  {
    question: "Can I customize the assistant's appearance?",
    answer:
      "Yes. Change the greeting, personality, accent and background colours, avatar (emoji or uploaded logo), and place the widget on the left or right.",
  },
  {
    question: "Can I preview it before publishing?",
    answer:
      "A live preview sits beside the editor and updates as you type. You can also save a draft and come back later.",
  },
  {
    question: "How do I embed Margo on my website?",
    answer:
      "Open My Agents, choose Get Embed Code from the agent's menu, copy the snippet, and paste it before the closing </body> tag on your pages.",
  },
  {
    question: "Can I edit an agent after publishing?",
    answer:
      "Yes. Select Customize on the agent card, make your changes, and publish again to update the live widget.",
  },
];

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

const CARD_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** Small screenshot with a caption; falls back to a placeholder when missing. */

function GuideImage({
  src,
  alt,
  caption,
  size = "card",
}: {
  src: string;
  alt: string;
  caption: string;
  size?: "card" | "tutorial";
}) {
  const [failed, setFailed] = useState(false);

  const frame =
    size === "card" ? "h-[150px] sm:h-[170px]" : "h-[180px] sm:h-[220px]";

  return (
    <figure className="w-full min-w-0">
      <div
        className={`flex w-full items-center justify-center overflow-hidden border-b border-line bg-slate-50 ${frame}`}
      >
        {failed ? (
          <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-ink-400">
            Screenshot unavailable
          </p>
        ) : (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="block h-full w-full object-contain"
          />
        )}
      </div>

      <figcaption className="px-3 pt-2 text-center text-[11.5px] leading-relaxed text-ink-400">
        {caption}
      </figcaption>
    </figure>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold tracking-tight text-ink-900">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Insights — a short, illustrated guide to building, customizing and embedding
 * a Margo assistant. Content only: the dashboard shell provides navigation.
 */
export function Insight() {
  const faqId = useId();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="space-y-10">
      {/* Page header */}
      <section
        className="overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-soft sm:p-7"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #ffffff 0%, #ffffff 58%, #9eebe4 100%)",
        }}
      >
        <p className="text-[11px] font-medium tracking-[0.08em] text-brand-600 uppercase">
          Quick start guide
        </p>
        <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-ink-900 sm:text-[22px]">
          Get the Most Out of Margo
        </h2>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
          Learn how to personalize your AI assistant, teach it about your
          business, and bring it to your website.
        </p>

        <Link to="/dashboard/agent/new" className={`mt-5 ${CARD_BUTTON}`}>
          Customize Your Agent
          <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>

      {/* Getting started */}
      <section>
        <SectionHeading
          title="Getting started"
          description="Four things to set up before your assistant goes live."
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {START_CARDS.map((card) => (
            <article
              key={card.title}
              className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-soft"
            >
              <GuideImage
                src={card.src}
                alt={card.alt}
                caption={card.caption}
              />

              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[13.5px] font-semibold text-ink-900">
                  {card.title}
                </h3>

                <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-500">
                  {card.description}
                </p>

                <Link
                  to={card.to}
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  {card.linkLabel}
                  <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Customization features */}
      <section>
        <SectionHeading
          title="Everything you can customize"
          description="The controls available in the agent editor — all with a live preview."
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="min-w-0 rounded-lg border border-line bg-white p-3.5 shadow-soft"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                  {feature.swatch ? (
                    <span className="flex -space-x-1" aria-hidden="true">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-white"
                        style={{ backgroundColor: feature.swatch.accent }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-white"
                        style={{ backgroundColor: feature.swatch.background }}
                      />
                    </span>
                  ) : Icon ? (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </span>

                <p className="mt-2.5 text-[12.5px] font-semibold text-ink-900">
                  {feature.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Website integration */}
      <section className="rounded-xl border border-line bg-white p-5 shadow-soft sm:p-6">
        <div className="grid items-center gap-5 md:grid-cols-2 md:gap-8">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold tracking-tight text-ink-900">
              Bring Margo to Your Website
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
              Give your visitors instant access to an AI assistant tailored to
              your business.
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">
              Open <span className="font-medium text-ink-700">My Agents</span>,
              select an agent's menu, then choose{" "}
              <span className="font-medium text-ink-700">Get Embed Code</span>{" "}
              and paste the snippet before your closing{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[11.5px] text-ink-700">
                &lt;/body&gt;
              </code>{" "}
              tag.
            </p>

            <Link to="/dashboard/agent" className={`mt-4 ${SECONDARY_BUTTON}`}>
              View My Agents
              <LuArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <GuideImage
            src={SHOT.agentMenu}
            alt="Agent card menu open with the Get Embed Code option"
            caption="The agent menu is where you find Get Embed Code."
            size="tutorial"
          />
        </div>
      </section>

      {/* FAQ */}
      <section>
        <SectionHeading
          title="Frequently asked questions"
          description="Short answers to the questions people ask most."
        />

        <ul className="mt-4 space-y-2">
          {FAQS.map((faq, index) => {
            const open = openFaq === index;
            const panelId = `${faqId}-panel-${index}`;
            const buttonId = `${faqId}-button-${index}`;

            return (
              <li
                key={faq.question}
                className="overflow-hidden rounded-lg border border-line bg-white shadow-soft"
              >
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenFaq(open ? null : index)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-medium text-ink-900 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                  >
                    {faq.question}
                    <LuPlus
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200 ${
                        open ? "rotate-45" : ""
                      }`}
                    />
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!open}
                  className="px-4 pb-3.5 text-[12.5px] leading-relaxed text-ink-500"
                >
                  {faq.answer}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
