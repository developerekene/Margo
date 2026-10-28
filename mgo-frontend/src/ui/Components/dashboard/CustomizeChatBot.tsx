import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { LuArrowLeft } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";

import type {
  Agent as AgentRecord,
  AgentStatus,
  KnowledgeSource,
} from "../../../Redux/Slices/agentslic";
import { agentSaved } from "../../../Redux/Slices/agentslic";
import type { RootState } from "../../../Redux/Store";
import { chatbotConfig } from "../../pages/chatbotdata";
import type { ChatbotConfig } from "../../pages/chatbotdata";
import { TextField } from "../TextField";
import { AgentPreview } from "./AgentPreview";
import { KnowledgeBase } from "./KnowledgeBase";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

const TONES = [
  { id: "friendly", label: "Friendly", hint: "Warm and helpful" },
  { id: "professional", label: "Professional", hint: "Formal and precise" },
  { id: "playful", label: "Playful", hint: "Light and casual" },
  { id: "concise", label: "Concise", hint: "Short and direct" },
] as const;

const ACCENTS = [
  { value: "#0a756c", label: "Margo teal" },
  { value: "#3fa79c", label: "Soft teal" },
  { value: "#1f2933", label: "Ink" },
  { value: "#ffeacf", label: "Sand" },
];

const BACKGROUNDS = [
  { value: "#ffffff", label: "White" },
  { value: "#f8fafc", label: "Mist" },
  { value: "#f0faf8", label: "Teal tint" },
  { value: "#ffeacf", label: "Sand" },
];

const AVATARS = ["🤖", "💬", "🧠", "✨"];

/* -------------------------------------------------------------------------- */
/* Draft helpers                                                              */
/* -------------------------------------------------------------------------- */

type Draft = {
  name: string;
  description: string;
  website: string;
  personality: string;
  config: ChatbotConfig;
  knowledgeSources: KnowledgeSource[];
};

type DraftErrors = {
  name?: string;
  description?: string;
};

function blankDraft(): Draft {
  return {
    name: "",
    description: "",
    website: "",
    personality: TONES[0].id,
    config: { ...chatbotConfig },
    knowledgeSources: [],
  };
}

function toDraft(agent: AgentRecord): Draft {
  const storedSources = Array.isArray(agent.knowledgeSources)
    ? agent.knowledgeSources
    : [];
  const knowledgeSources = storedSources.length
    ? storedSources
    : agent.website
      ? [
          {
            id: `website-${agent.id}`,
            type: "website" as const,
            label: agent.website,
            value: agent.website,
            addedAt: agent.updatedAt,
          },
        ]
      : [];

  return {
    name: agent.name,
    description: agent.description,
    website: agent.website,
    personality: agent.personality || TONES[0].id,
    config: { ...agent.config },
    knowledgeSources,
  };
}

function validateDraft(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  const description = draft.description.trim();

  if (!name) errors.name = "Give your agent a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";

  if (!description) errors.description = "Add a short description.";
  else if (description.length > 160)
    errors.description = "Keep the description under 160 characters.";

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Field groups                                                               */
/* -------------------------------------------------------------------------- */

function SwatchGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-ink-700">
        {label}
      </legend>

      <div className="flex flex-wrap items-center gap-2.5">
        {options.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              aria-label={option.label}
              title={option.label}
              onClick={() => onChange(option.value)}
              style={{ backgroundColor: option.value }}
              className={`h-8 w-8 rounded-full border transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                active
                  ? "border-transparent ring-2 ring-brand-500 ring-offset-2"
                  : "border-line hover:border-line-strong"
              }`}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Create / customize one agent. Edits stay local until Save draft or Publish,
 * then the agent is upserted into the `agents` slice by its unique id and the
 * user returns to My Agents.
 */
export function CustomizeChatBot() {
  const { agentId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const descriptionId = useId();
  const avatarInputId = useId();

  const existing = useSelector((state: RootState) =>
    agentId
      ? state.agents.items.find((agent) => agent.id === agentId)
      : undefined,
  );

  const [draft, setDraft] = useState<Draft>(() =>
    existing ? toDraft(existing) : blankDraft(),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const isPublished = existing?.status === "published";

  function updateConfig(patch: Partial<ChatbotConfig>) {
    setDraft((current) => ({
      ...current,
      config: { ...current.config, ...patch },
    }));
  }

  /** Read a picked image as a data URL so the avatar survives a reload. */
  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Choose a PNG, JPG, WEBP or SVG image.");
      return;
    }

    if (file.size > 1024 * 1024) {
      setAvatarError("Keep the image under 1 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setAvatarError("Couldn’t read that image. Try another file.");
        return;
      }
      setAvatarError(null);
      updateConfig({ botAvatar: reader.result });
    };
    reader.onerror = () =>
      setAvatarError("Couldn’t read that image. Try another file.");
    reader.readAsDataURL(file);
  }

  function save(mode: "save" | "publish") {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    const now = new Date().toISOString();
    const status: AgentStatus =
      mode === "publish" ? "published" : (existing?.status ?? "draft");
    const websiteSource = draft.knowledgeSources.find(
      (source) => source.type === "website",
    );

    const next: AgentRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      website: websiteSource?.value ?? draft.website,
      status,
      personality: draft.personality,
      config: {
        ...draft.config,
        title: draft.name.trim(),
        welcomeMessage:
          draft.config.welcomeMessage.trim() || chatbotConfig.welcomeMessage,
      },
      knowledgeSources: draft.knowledgeSources,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    dispatch(agentSaved(next));
    navigate("/dashboard/agent");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save("publish");
  }

  if (agentId && !existing) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center shadow-soft">
        <h2 className="text-[15px] font-semibold text-ink-900">
          Agent not found
        </h2>
        <p className="mt-1.5 text-[13px] text-ink-500">
          This agent may have been deleted.
        </p>
        <Link
          to="/dashboard/agent"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Back to My Agents
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/dashboard/agent"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <LuArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to My Agents
      </Link>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="space-y-5">
          {/* Agent details */}
          <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
            <h2 className="text-[15px] font-semibold text-ink-900">
              Agent details
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">
              The name and summary shown on My Agents.
            </p>

            <div className="mt-5 space-y-5">
              <TextField
                label="Agent name"
                value={draft.name}
                maxLength={60}
                placeholder="e.g. Margo sales assistant"
                error={errors.name}
                onChange={(event) => {
                  setErrors((current) => ({ ...current, name: undefined }));
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                }}
              />

              <div>
                <label
                  htmlFor={descriptionId}
                  className="mb-1.5 block text-[13px] font-medium text-ink-700"
                >
                  Short description
                </label>
                <textarea
                  id={descriptionId}
                  rows={3}
                  maxLength={160}
                  value={draft.description}
                  placeholder="What should this agent help visitors with?"
                  onChange={(event) => {
                    setErrors((current) => ({
                      ...current,
                      description: undefined,
                    }));
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }));
                  }}
                  aria-invalid={Boolean(errors.description) || undefined}
                  aria-describedby={
                    errors.description ? `${descriptionId}-error` : undefined
                  }
                  className={`w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:ring-4 ${
                    errors.description
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500/10"
                      : "border-line focus:border-brand-500 focus:ring-brand-500/10"
                  }`}
                />
                <div className="mt-1.5 flex justify-between gap-3">
                  <p className="text-[12.5px] text-ink-400">
                    A brief summary of what this agent is for.
                  </p>
                  <span className="shrink-0 text-[12px] text-ink-400">
                    {draft.description.length}/160
                  </span>
                </div>
                {errors.description ? (
                  <p
                    id={`${descriptionId}-error`}
                    role="alert"
                    className="mt-1 text-[12.5px] text-red-600"
                  >
                    {errors.description}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <KnowledgeBase
            sources={draft.knowledgeSources}
            onChange={(knowledgeSources) =>
              setDraft((current) => ({
                ...current,
                knowledgeSources,
                website:
                  knowledgeSources.find((source) => source.type === "website")
                    ?.value ?? "",
              }))
            }
          />

          {/* Assistant setup */}
          <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
            <h2 className="text-[15px] font-semibold text-ink-900">
              Assistant setup
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">
              How the chatbot greets visitors and looks on your website.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label
                  htmlFor={`${descriptionId}-greeting`}
                  className="mb-1.5 block text-[13px] font-medium text-ink-700"
                >
                  Greeting message
                </label>
                <textarea
                  id={`${descriptionId}-greeting`}
                  rows={3}
                  value={draft.config.welcomeMessage}
                  onChange={(event) =>
                    updateConfig({ welcomeMessage: event.target.value })
                  }
                  className="w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                />
                <p className="mt-1.5 text-[12.5px] text-ink-400">
                  The first message a visitor sees when the widget opens.
                </p>
              </div>

              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink-700">
                  Personality
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TONES.map((tone) => {
                    const active = draft.personality === tone.id;

                    return (
                      <button
                        key={tone.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            personality: tone.id,
                          }))
                        }
                        className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                          active
                            ? "border-brand-500 bg-brand-500/10"
                            : "border-line hover:border-line-strong hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`block text-[13.5px] font-medium ${
                            active ? "text-brand-700" : "text-ink-900"
                          }`}
                        >
                          {tone.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink-400">
                          {tone.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <SwatchGroup
                label="Accent color"
                options={ACCENTS}
                value={draft.config.accentColor}
                onChange={(value) => updateConfig({ accentColor: value })}
              />

              <SwatchGroup
                label="Background color"
                options={BACKGROUNDS}
                value={draft.config.backgroundColor}
                onChange={(value) => updateConfig({ backgroundColor: value })}
              />

              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink-700">
                  Assistant avatar
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  {AVATARS.map((option) => {
                    const active = draft.config.botAvatar === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        aria-label={`Avatar ${option}`}
                        onClick={() => updateConfig({ botAvatar: option })}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[16px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                          active
                            ? "border-brand-500 bg-brand-500/10"
                            : "border-line hover:border-line-strong hover:bg-slate-50"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}

                  {!AVATARS.includes(draft.config.botAvatar) ? (
                    <span className="relative">
                      <span
                        title="Uploaded image"
                        aria-label="Uploaded image"
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-brand-500 bg-brand-500/10"
                      >
                        <img
                          src={draft.config.botAvatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarError(null);
                          updateConfig({ botAvatar: AVATARS[0] });
                        }}
                        aria-label="Remove uploaded image"
                        title="Remove uploaded image"
                        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-white text-[10px] leading-none text-ink-500 transition-colors hover:border-red-300 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
                      >
                        ×
                      </button>
                    </span>
                  ) : null}

                  <label
                    htmlFor={avatarInputId}
                    className="flex h-9 cursor-pointer items-center rounded-lg border border-dashed border-line-strong px-3 text-[12px] font-medium text-ink-500 transition-colors hover:border-brand-500 hover:text-ink-900 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500"
                  >
                    Upload image
                  </label>
                  <input
                    id={avatarInputId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleAvatarUpload}
                    className="sr-only"
                  />
                </div>

                <p className="mt-1.5 text-[12.5px] text-ink-400">
                  Pick an emoji, or upload your own logo (PNG, JPG, WEBP or SVG
                  under 1 MB).
                </p>
                {avatarError ? (
                  <p role="alert" className="mt-1 text-[12.5px] text-red-600">
                    {avatarError}
                  </p>
                ) : null}
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
                  Widget position
                </legend>
                <div className="inline-flex rounded-lg border border-line p-0.5">
                  {(["left", "right"] as const).map((option) => {
                    const active = draft.config.botSide === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateConfig({ botSide: option })}
                        className={`rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                          active
                            ? "bg-brand-500 text-white"
                            : "text-ink-500 hover:text-ink-900"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {isPublished ? "Update & publish" : "Publish agent"}
            </button>

            <button
              type="button"
              onClick={() => save("save")}
              className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {existing ? "Save changes" : "Save draft"}
            </button>

            <Link
              to="/dashboard/agent"
              className="px-1 py-2.5 text-[13px] font-medium text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Cancel
            </Link>
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-xl border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-ink-900">
                Live preview
              </h2>
              <span className="text-[11.5px] text-ink-400">
                {existing ? "Saved settings" : "New agent"}
              </span>
            </div>

            <div className="mt-3">
              <AgentPreview
                config={{
                  ...draft.config,
                  title: draft.name.trim() || "Your assistant",
                }}
                name={draft.name.trim() || "Your assistant"}
              />
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
              Visitors see this once the agent is published and embedded on your
              website.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
