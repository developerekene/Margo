import { useId, useState } from "react";

import { LuUpload } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { agentUpdated } from "../../../Redux/Slices/agentslic";
import { welcomeMessageChanged } from "../../../Redux/Slices/chatslic";
import type { RootState } from "../../../Redux/Store";
import { readableTextOn } from "../../pages/chatbotdata";
import { ChatbotAvatar } from "../ChatbotHeader";
import { ArrowUpIcon, CheckIcon } from "../Icons";
import { TextField } from "../TextField";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

type Tone = {
  id: string;
  label: string;
  hint: string;
};

const TONES: Tone[] = [
  { id: "friendly", label: "Friendly", hint: "Warm and helpful" },
  { id: "professional", label: "Professional", hint: "Formal and precise" },
  { id: "playful", label: "Playful", hint: "Light and casual" },
  { id: "concise", label: "Concise", hint: "Short and direct" },
];

type Swatch = {
  value: string;
  label: string;
  /** Text/icon colour that stays legible on top of the swatch. */
  on: string;
};

const ACCENTS: Swatch[] = [
  { value: "#0a756c", label: "Margo teal", on: "#ffffff" },
  { value: "#3fa79c", label: "Soft teal", on: "#ffffff" },
  { value: "#1f2933", label: "Ink", on: "#ffffff" },
  { value: "#ffeacf", label: "Sand", on: "#1f2933" },
];

const BACKGROUNDS: Swatch[] = [
  { value: "#ffffff", label: "White", on: "#1f2933" },
  { value: "#f8fafc", label: "Mist", on: "#1f2933" },
  { value: "#f0faf8", label: "Teal tint", on: "#1f2933" },
  { value: "#ffeacf", label: "Sand", on: "#1f2933" },
];

const BOT_COLORS: Swatch[] = [
  { value: "#f0faf8", label: "Teal tint", on: "#0a756c" },
  { value: "#ffffff", label: "White", on: "#1f2933" },
  { value: "#f8fafc", label: "Mist", on: "#1f2933" },
  { value: "#ffeacf", label: "Sand", on: "#1f2933" },
  { value: "#0a756c", label: "Margo teal", on: "#ffffff" },
  { value: "#1f2933", label: "Ink", on: "#ffffff" },
];

const AVATARS = ["🤖", "💬", "🧠"];

const EXAMPLE_QUESTION = "What services do you offer?";
const EXAMPLE_ANSWER =
  "We help businesses turn their website into an AI assistant that answers visitor questions instantly.";

/** Accepts #rgb, #rrggbb or rgb(r, g, b) and normalises it to `#rrggbb`. */
function normaliseColor(input: string): string | null {
  const value = input.trim().toLowerCase();

  const hex = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1];
    return `#${digits.length === 3 ? digits.replace(/./g, (d) => d + d) : digits}`;
  }

  const rgb = value.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
  );
  if (!rgb) return null;

  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) return null;

  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Swatches plus a free-text hex/rgb field — used for accent and background. */
function ColorField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Swatch[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const invalid = draft.trim() !== "" && normaliseColor(draft) === null;

  function commit(text: string) {
    setDraft(text);
    const colour = normaliseColor(text);
    if (colour) onChange(colour);
  }

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
              key={option.label}
              type="button"
              aria-pressed={active}
              aria-label={option.label}
              title={option.label}
              onClick={() => commit(option.value)}
              style={{ backgroundColor: option.value }}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-shadow ${
                active
                  ? "border-transparent ring-2 ring-brand-500 ring-offset-2"
                  : "border-line hover:border-line-strong"
              }`}
            >
              {active ? (
                <span style={{ color: option.on }}>
                  <CheckIcon className="h-4 w-4" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-lg border border-line"
          style={{ backgroundColor: value }}
        />
        <input
          value={draft}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setDraft(value)}
          placeholder="#0a756c or rgb(10, 117, 108)"
          aria-label={`${label} value`}
          aria-invalid={invalid || undefined}
          className={`h-9 w-full max-w-[16rem] rounded-lg border bg-white px-3 text-[13px] text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:ring-4 ${
            invalid
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/10"
              : "border-line focus:border-brand-500 focus:ring-brand-500/10"
          }`}
        />
      </div>

      {invalid ? (
        <p role="alert" className="mt-1.5 text-[12.5px] text-red-600">
          Use a hex or rgb() value, e.g. #0a756c or rgb(10, 117, 108).
        </p>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Agent settings — identity and appearance, with a live preview of the widget.
 * Edits are written straight to the `agent` slice, so the widget picks them up
 * immediately; personality is still local to this page.
 */
export function Agent() {
  const greetingId = useId();
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.agent);

  const [tone, setTone] = useState(TONES[0].id);
  const [saved, setSaved] = useState(false);

  /** Any edit invalidates the "Saved" confirmation. */
  const touch = () => setSaved(false);

  /** Logos are read as a data URL — `ChatbotAvatar` renders image sources. */
  function handleLogoUpload(file: File | undefined) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      touch();
      dispatch(agentUpdated({ botAvatar: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  const botLeft = config.botSide === "left";
  const isLogo = !AVATARS.includes(config.botAvatar);
  const onAccent = readableTextOn(config.accentColor);
  const assistantName = config.title.trim() || "Margo assistant";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="space-y-5">
        {/* Identity */}
        <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
          <h2 className="text-[15px] font-semibold text-ink-900">Identity</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            How your assistant introduces itself to visitors.
          </p>

          <div className="mt-5 space-y-5">
            <TextField
              label="Assistant name"
              value={config.title}
              hint="Shown in the widget header and in conversation history."
              onChange={(event) => {
                touch();
                dispatch(agentUpdated({ title: event.target.value }));
              }}
            />

            <div>
              <label
                htmlFor={greetingId}
                className="mb-1.5 block text-[13px] font-medium text-ink-700"
              >
                Greeting message
              </label>
              <textarea
                id={greetingId}
                rows={3}
                value={config.welcomeMessage}
                onChange={(event) => {
                  touch();
                  const text = event.target.value;
                  dispatch(agentUpdated({ welcomeMessage: text }));
                  // Keep the opening assistant message in sync with the greeting.
                  dispatch(welcomeMessageChanged(text));
                }}
                className="w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 caret-brand-500 outline-none transition-colors duration-150 placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              />
              <p className="mt-1.5 text-[12.5px] text-ink-400">
                The first message a visitor sees when the widget opens.
              </p>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
                Personality
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TONES.map((option) => {
                  const active = tone === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        touch();
                        setTone(option.id);
                      }}
                      className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
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
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ink-400">
                        {option.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </section>

        {/* Appearance */}
        <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
          <h2 className="text-[15px] font-semibold text-ink-900">Appearance</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            Match the widget to your brand.
          </p>

          <div className="mt-5 space-y-5">
            <ColorField
              label="Accent color"
              options={ACCENTS}
              value={config.accentColor}
              onChange={(value) => {
                touch();
                dispatch(agentUpdated({ accentColor: value }));
              }}
            />

            <ColorField
              label="Background color"
              options={BACKGROUNDS}
              value={config.backgroundColor}
              onChange={(value) => {
                touch();
                dispatch(agentUpdated({ backgroundColor: value }));
              }}
            />

            <ColorField
              label="Assistant message color"
              options={BOT_COLORS}
              value={config.botColor}
              onChange={(value) => {
                touch();
                dispatch(agentUpdated({ botColor: value }));
              }}
            />

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-ink-700">
                Assistant avatar
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                {AVATARS.map((option) => {
                  const active = config.botAvatar === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Avatar ${option}`}
                      onClick={() => {
                        touch();
                        dispatch(agentUpdated({ botAvatar: option }));
                      }}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[16px] transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-line hover:border-line-strong hover:bg-slate-50"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}

                <label
                  className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors ${
                    isLogo
                      ? "border-brand-500 bg-brand-500/10 text-brand-700"
                      : "border-line text-ink-500 hover:border-line-strong hover:bg-slate-50"
                  }`}
                >
                  {isLogo ? (
                    <img
                      src={config.botAvatar}
                      alt=""
                      className="h-5 w-5 rounded object-cover"
                    />
                  ) : (
                    <LuUpload className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Upload logo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Upload a logo image"
                    onChange={(event) => {
                      handleLogoUpload(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-ink-700">
                Widget position
              </legend>
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(["left", "right"] as const).map((option) => {
                  const active = config.botSide === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        touch();
                        dispatch(agentUpdated({ botSide: option }));
                      }}
                      className={`rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium capitalize transition-colors ${
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
            Save changes
          </button>

          <Link
            to="/chatbot"
            className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Preview widget
          </Link>

          <p
            role="status"
            aria-live="polite"
            className="text-[12.5px] font-medium text-brand-700"
          >
            {saved ? "Saved — your assistant is up to date." : ""}
          </p>
        </div>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-xl border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-ink-900">
              Live preview
            </h2>
            <span className="text-[11.5px] text-ink-400">Widget</span>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            <header
              className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-3"
              style={{ backgroundColor: config.backgroundColor }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[15px]">
                  {config.botAvatar}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[12.5px] font-semibold text-ink-900">
                    {assistantName}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    Usually replies instantly
                  </p>
                </div>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-medium text-ink-500">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: config.accentColor }}
                  aria-hidden="true"
                />
                Online
              </span>
            </header>

            <div
              className="space-y-3 px-3.5 py-4"
              style={{ backgroundColor: config.backgroundColor }}
            >
              {/* Assistant greeting */}
              <div
                className={`flex items-end gap-2 ${
                  botLeft ? "" : "flex-row-reverse"
                }`}
              >
                <ChatbotAvatar
                  source={config.botAvatar}
                  label={assistantName}
                />
                <p
                  className="max-w-[84%] rounded-2xl rounded-bl-md border border-line px-3 py-2 text-[12.5px] leading-relaxed"
                  style={{
                    backgroundColor: config.botColor,
                    color: readableTextOn(config.botColor),
                  }}
                >
                  {config.welcomeMessage.trim() ||
                    "Hi! How can I help you today?"}
                </p>
              </div>

              {/* Visitor */}
              <div
                className={`flex items-end gap-2 ${
                  botLeft ? "flex-row-reverse" : ""
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] ring-1 ring-line">
                  🧑
                </span>
                <p
                  className="max-w-[84%] rounded-2xl rounded-br-md px-3 py-2 text-[12.5px] leading-relaxed"
                  style={{
                    backgroundColor: config.accentColor,
                    color: onAccent,
                  }}
                >
                  {EXAMPLE_QUESTION}
                </p>
              </div>

              {/* Assistant reply */}
              <div
                className={`flex items-end gap-2 ${
                  botLeft ? "" : "flex-row-reverse"
                }`}
              >
                <ChatbotAvatar
                  source={config.botAvatar}
                  label={assistantName}
                />
                <p
                  className="max-w-[84%] rounded-2xl rounded-bl-md border border-line px-3 py-2 text-[12.5px] leading-relaxed"
                  style={{
                    backgroundColor: config.botColor,
                    color: readableTextOn(config.botColor),
                  }}
                >
                  {EXAMPLE_ANSWER}
                </p>
              </div>
            </div>

            <div
              className="flex items-center gap-2 border-t border-line px-3 py-3"
              style={{ backgroundColor: config.backgroundColor }}
            >
              <span className="h-10 flex-1 rounded-lg border border-line px-3.5 py-2.5 text-[13px] text-ink-400">
                Type a message…
              </span>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: config.accentColor, color: onAccent }}
                aria-hidden="true"
              >
                <ArrowUpIcon className="h-4.5 w-4.5" />
              </span>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
            Visitors see this on your website once your widget is installed.
          </p>
        </div>
      </aside>
    </form>
  );
}
