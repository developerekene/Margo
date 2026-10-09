import { useState } from "react";

import { LuUpload } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";

import { messageAdded } from "../../../Redux/Slices/chatslic";
import type { RootState } from "../../../Redux/Store";
import { ChatbotMessage } from "../ChatbotMessage";

/** What the assistant says once a document joins its knowledge. */
function uploadedText(fileName: string) {
  return `I've added ${fileName} to my knowledge — ask me anything about it.`;
}

/** Knowledge — document uploads that feed the assistant's knowledge. */
export function Knowledge() {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.agent);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);

  function handleFiles(selected: FileList | null) {
    if (!selected?.length) return;

    const added = Array.from(selected, (file) => ({
      id: crypto.randomUUID(),
      name: file.name,
    }));

    setFiles((prev) => [...prev, ...added]);

    // Each upload is announced by the assistant, so the widget shows it too.
    added.forEach((file) =>
      dispatch(messageAdded("bot", uploadedText(file.name))),
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
        <h2 className="text-[15px] font-semibold text-ink-900">
          Upload documents
        </h2>
        <p className="mt-1 text-[13px] text-ink-500">
          Add PDFs or Markdown files containing information about your business.
        </p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-slate-50/60 px-6 py-8 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/40 focus-within:border-brand-500">
          <LuUpload className="h-5 w-5 text-brand-500" aria-hidden="true" />
          <span className="text-[13.5px] font-medium text-ink-900">
            Click to upload files
          </span>
          <span className="text-[12px] text-ink-400">
            PDF or Markdown, up to 10 MB each
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.md,.markdown,.txt"
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        {files.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="rounded-full border border-line bg-slate-50 px-3 py-1 text-[12px] text-ink-500"
              >
                {file.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[12.5px] text-ink-400">
            No documents yet — add your first knowledge source to get started.
          </p>
        )}
      </section>

      {files.length ? (
        <section className="rounded-xl border border-line bg-white p-5 shadow-soft">
          <h2 className="text-[15px] font-semibold text-ink-900">Assistant</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            Margo confirms every upload — the same messages show up in the
            widget.
          </p>

          <div className="mt-4 space-y-3">
            {files.map((file) => (
              <ChatbotMessage
                key={file.id}
                text={uploadedText(file.name)}
                config={config}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
