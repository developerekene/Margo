import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { AlertCircleIcon, Spinner } from "./Icons";

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "children"
> & {
  label: string;
  /** Helper copy shown when there is no error. */
  hint?: string;
  /** Validation message. Also switches the field into its error state. */
  error?: string;
  /** Rendered inside the field on the right (e.g. a password toggle). */
  trailing?: ReactNode;
  /** Shows an inline spinner while the form is submitting. */
  loading?: boolean;
  ref?: Ref<HTMLInputElement>;
};

const BASE_CLASSES =
  "h-11 w-full rounded-lg border bg-white pl-3.5 text-[15px] text-ink-900 caret-brand-500 outline-none transition-colors duration-150 placeholder:text-ink-400 disabled:cursor-not-allowed disabled:border-line disabled:bg-slate-50 disabled:text-ink-400";

const DEFAULT_STATE =
  "border-line hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

const ERROR_STATE =
  "border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

export function TextField({
  label,
  hint,
  error,
  trailing,
  loading = false,
  ref,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const invalid = Boolean(error);
  const message = error ?? hint;
  const hasAdornment = Boolean(trailing) || loading;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-ink-700"
      >
        {label}
      </label>

      <div className="relative">
        <input
          {...inputProps}
          ref={ref}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? messageId : undefined}
          className={`${BASE_CLASSES} ${invalid ? ERROR_STATE : DEFAULT_STATE} ${
            hasAdornment ? "pr-11" : "pr-3.5"
          }`}
        />

        {loading && !trailing ? (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center">
            <Spinner className="h-4 w-4 text-ink-400" />
          </span>
        ) : null}

        {trailing}
      </div>

      {message ? (
        <p
          id={messageId}
          role={invalid ? "alert" : undefined}
          className={`mt-1.5 flex items-start gap-1.5 text-[12.5px] ${
            invalid ? "text-red-600" : "text-ink-400"
          }`}
        >
          {invalid ? (
            <AlertCircleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : null}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
