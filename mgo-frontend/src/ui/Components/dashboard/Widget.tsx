import { useState } from "react";

import { LuCheck, LuCopy } from "react-icons/lu";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import type { RootState } from "../../../Redux/Store";

const WIDGET_SRC = "http://localhost:5173/margo.js";

/** The tag a customer pastes before `</body>`; `margo.js` loads the widget. */
function embedSnippet() {
  return `<script
  src="${WIDGET_SRC}"
  data-chatbot-id="demo"
  async>
</script>`;
}

const STEPS = [
  "Copy the code below.",
  "Paste it just before the closing </body> tag on every page you want Margo on.",
  "Publish your site — the widget appears with the settings you saved.",
];

/** Widget — the embed code generated from the saved agent settings. */
export function Widget() {
  const config = useSelector((state: RootState) => state.agent);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const snippet = embedSnippet();

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Embed code
            </h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-500">
              Paste this on your website to load your assistant. It is built
              from the settings you saved in{" "}
              <Link
                to="/dashboard/agent"
                className="font-medium text-brand-600 transition-colors hover:text-brand-700"
              >
                Agent
              </Link>
              , so edit those first if something looks off.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {copied ? (
              <LuCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LuCopy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-ink-900 p-4 text-[12.5px] leading-relaxed text-slate-100">
          <code>{snippet}</code>
        </pre>

        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-[12.5px] text-ink-400"
        >
          {failed
            ? "Copying failed — select the code above and copy it manually."
            : ""}
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {[
            { label: "Assistant", value: config.title, swatch: false },
            { label: "Accent", value: config.accentColor, swatch: true },
            {
              label: "Background",
              value: config.backgroundColor,
              swatch: true,
            },
            { label: "Message", value: config.botColor, swatch: true },
          ].map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase">
                {row.label}
              </dt>
              <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-900">
                {row.swatch ? (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: row.value }}
                  />
                ) : null}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
        <h2 className="text-[15px] font-semibold text-ink-900">
          Install steps
        </h2>

        <ol className="mt-3 space-y-2.5">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <span className="text-[13px] leading-relaxed text-ink-700">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
