import { AlertCircleIcon } from "./Icons";

/** Inline error shown when the API rejects a whole submission. */
export function FormAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
    >
      <AlertCircleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
