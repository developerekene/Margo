import { useId, useState } from "react";
import type { DragEvent } from "react";

import type { IconType } from "react-icons";
import {
  LuFileText,
  LuGlobe,
  LuMessageSquare,
  LuPlus,
  LuTrash2,
  LuUpload,
} from "react-icons/lu";

import type {
  KnowledgeSource,
  KnowledgeSourceType,
} from "../../../Redux/Slices/agentslic";
import { TextField } from "../TextField";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

const SOURCE_TYPES: {
  type: KnowledgeSourceType;
  label: string;
  icon: IconType;
}[] = [
  { type: "website", label: "Website", icon: LuGlobe },
  { type: "file", label: "Files", icon: LuFileText },
  { type: "faq", label: "FAQ", icon: LuMessageSquare },
];

const SOURCE_ICONS: Record<KnowledgeSourceType, IconType> = {
  website: LuGlobe,
  file: LuFileText,
  faq: LuMessageSquare,
};

const TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  website: "Website",
  file: "File",
  faq: "FAQ",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normaliseUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

type KnowledgeBaseProps = {
  sources: KnowledgeSource[];
  onChange: (sources: KnowledgeSource[]) => void;
};

/**
 * Multi-source knowledge editor: websites, uploaded files and FAQ pairs. A
 * single agent can mix any number of source types.
 */
export function KnowledgeBase({ sources, onChange }: KnowledgeBaseProps) {
  const answerId = useId();
  const [activeType, setActiveType] = useState<KnowledgeSourceType>("website");

  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState<string>();

  const [fileError, setFileError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [faqError, setFaqError] = useState<string>();

  function addSource(source: KnowledgeSource) {
    onChange([...sources, source]);
  }

  function addWebsite() {
    const value = website.trim();
    if (!value) {
      setWebsiteError("Add a website URL.");
      return;
    }

    let url: URL;
    try {
      url = new URL(normaliseUrl(value));
    } catch {
      setWebsiteError("Enter a valid URL, e.g. https://example.com.");
      return;
    }

    if (!url.hostname.includes(".")) {
      setWebsiteError("Enter a valid URL, e.g. https://example.com.");
      return;
    }

    if (
      sources.some(
        (source) => source.type === "website" && source.value === url.href,
      )
    ) {
      setWebsiteError("That website is already in the knowledge base.");
      return;
    }

    addSource({
      id: crypto.randomUUID(),
      type: "website",
      label: url.hostname,
      value: url.href,
      addedAt: new Date().toISOString(),
    });

    setWebsite("");
    setWebsiteError(undefined);
  }

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;

    const files = Array.from(selected);
    const accepted = files.filter((file) => file.size <= MAX_FILE_SIZE);
    const rejected = files.filter((file) => file.size > MAX_FILE_SIZE);

    setFileError(
      rejected.length
        ? `${rejected.map((file) => file.name).join(", ")} ${
            rejected.length === 1 ? "is" : "are"
          } larger than the 10 MB limit.`
        : undefined,
    );

    if (!accepted.length) return;

    onChange([
      ...sources,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        type: "file" as const,
        label: file.name,
        value: `${formatBytes(file.size)} · ${file.type || "File"}`,
        size: file.size,
        addedAt: new Date().toISOString(),
      })),
    ]);
  }

  function addFaq() {
    const nextQuestion = question.trim();
    const nextAnswer = answer.trim();

    if (!nextQuestion || !nextAnswer) {
      setFaqError("Add both a question and an answer.");
      return;
    }

    addSource({
      id: crypto.randomUUID(),
      type: "faq",
      label: nextQuestion,
      value: nextAnswer,
      addedAt: new Date().toISOString(),
    });

    setQuestion("");
    setAnswer("");
    setFaqError(undefined);
  }

  function removeSource(id: string) {
    onChange(sources.filter((source) => source.id !== id));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">
            Knowledge base
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-500">
            Add websites, PDFs, FAQs or any other files your agent can learn
            from. You can mix and match as many sources as you need.
          </p>
        </div>

        <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-[11.5px] font-medium text-ink-500">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </div>

      {/* Source type picker */}
      <div
        role="group"
        aria-label="Choose a knowledge source type"
        className="mt-5 flex flex-wrap gap-1.5"
      >
        {SOURCE_TYPES.map(({ type, label, icon: Icon }) => {
          const active = activeType === type;

          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveType(type)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                active
                  ? "border-brand-500 bg-brand-500/10 text-brand-700"
                  : "border-line text-ink-500 hover:border-line-strong hover:bg-slate-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Website */}
      {activeType === "website" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextField
              label="Website URL"
              value={website}
              placeholder="https://example.com"
              hint="We'll crawl the site and use its pages as knowledge."
              error={websiteError}
              onChange={(event) => {
                setWebsite(event.target.value);
                setWebsiteError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addWebsite();
              }}
            />
          </div>

          <button
            type="button"
            onClick={addWebsite}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:mt-[26px]"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Add website
          </button>
        </div>
      ) : null}

      {/* Files */}
      {activeType === "file" ? (
        <div className="mt-4">
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors focus-within:border-brand-500 ${
              dragging
                ? "border-brand-500 bg-brand-50/60"
                : "border-line-strong bg-slate-50/60 hover:border-brand-500 hover:bg-brand-50/40"
            }`}
          >
            <LuUpload className="h-5 w-5 text-brand-500" aria-hidden="true" />
            <span className="text-[13.5px] font-medium text-ink-900">
              Click to upload or drag and drop
            </span>
            <span className="text-[12px] text-ink-400">
              PDF, DOCX, TXT, MD, CSV — or any other file, up to 10 MB each
            </span>
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>

          {fileError ? (
            <p role="alert" className="mt-2 text-[12.5px] text-red-600">
              {fileError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* FAQ */}
      {activeType === "faq" ? (
        <div className="mt-4 space-y-4">
          <TextField
            label="Question"
            value={question}
            placeholder="e.g. What are your opening hours?"
            onChange={(event) => {
              setQuestion(event.target.value);
              setFaqError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addFaq();
            }}
          />

          <div>
            <label
              htmlFor={answerId}
              className="mb-1.5 block text-[13px] font-medium text-ink-700"
            >
              Answer
            </label>
            <textarea
              id={answerId}
              rows={3}
              value={answer}
              placeholder="Write the answer your agent should give."
              onChange={(event) => {
                setAnswer(event.target.value);
                setFaqError(undefined);
              }}
              className="w-full resize-y rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-900 caret-brand-500 outline-none transition-colors placeholder:text-ink-400 hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>

          {faqError ? (
            <p role="alert" className="text-[12.5px] text-red-600">
              {faqError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={addFaq}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Add FAQ
          </button>
        </div>
      ) : null}

      {/* Added sources */}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-[13px] font-semibold text-ink-900">
          Added sources
        </h3>

        {sources.length ? (
          <ul className="mt-3 space-y-2">
            {sources.map((source) => {
              const Icon = SOURCE_ICONS[source.type];

              return (
                <li
                  key={source.id}
                  className="flex items-start gap-2.5 rounded-lg border border-line bg-slate-50/60 px-3 py-2.5"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-line">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-ink-900">
                        {source.label}
                      </p>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-ink-400 uppercase ring-1 ring-line">
                        {TYPE_LABELS[source.type]}
                      </span>
                    </div>
                    <p
                      title={source.value}
                      className="mt-0.5 truncate text-[12px] text-ink-400"
                    >
                      {source.value}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSource(source.id)}
                    aria-label={`Remove ${source.label}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  >
                    <LuTrash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-line bg-slate-50/50 px-4 py-6 text-center text-[12.5px] text-ink-400">
            No knowledge sources yet. Add a website, file or FAQ above.
          </p>
        )}
      </div>
    </section>
  );
}
