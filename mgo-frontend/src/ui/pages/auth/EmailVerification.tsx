import { useState } from "react";
import type { FormEvent } from "react";

import { LuArrowLeft, LuCircleCheck } from "react-icons/lu";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  getApiErrorMessage,
  useResendVerificationMutation,
} from "../../../api/endpoints";
import { AuthLayout } from "../../Components/AuthLayout";
import { FormAlert } from "../../Components/FormAlert";
import { LockIcon, Spinner } from "../../Components/Icons";
import { TextField } from "../../Components/TextField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/**
 * Email verification — re-sends the verification link for an account that was
 * created but never confirmed. `POST /identity/resend-verification` replies the
 * same way whether or not the address exists, and is rate-limited per address.
 */
export default function EmailVerification() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // RTK Query owns the request: `resend()` posts, `submitting` is in-flight.
  const [resend, { isLoading: submitting }] = useResendVerificationMutation();

  const trimmed = email.trim();
  const error = !trimmed
    ? "Enter the email you signed up with."
    : !EMAIL_PATTERN.test(trimmed)
      ? "Enter a valid email address, e.g. name@company.com."
      : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setFormError(null);

    if (error || submitting) return;

    try {
      const result = await resend({ email: trimmed }).unwrap();

      setSentTo(trimmed);
      toast.success("Verification email sent", {
        id: "email-verification",
        description:
          result.message ||
          `Check ${trimmed} for the link to activate your account.`,
        duration: 5000,
      });
    } catch (caught) {
      setFormError(getApiErrorMessage(caught));
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          <LockIcon className="h-3.5 w-3.5 text-brand-500" />
          We only email the verification link to the address you signed up with.
        </>
      }
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        Verify your email
      </h1>
      <p className="mt-2 text-[14px] text-ink-500">
        Margo asks you to confirm your email before your first sign-in. If the
        verification link expired or never arrived, request a new one below.
      </p>

      {sentTo ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-brand-800"
        >
          <LuCircleCheck
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold">Check your inbox.</span> We sent a
            new verification link to {sentTo}. Open it to activate your
            workspace, then sign in. Links can only be re-sent once a minute.
          </span>
        </div>
      ) : null}

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          error={touched ? error : undefined}
          disabled={submitting}
          loading={submitting}
          onChange={(event) => {
            setEmail(event.target.value);
            setSentTo(null);
            setFormError(null);
          }}
          onBlur={() => setTouched(true)}
        />

        {formError ? <FormAlert message={formError} /> : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-500 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" />
              Sending…
            </>
          ) : sentTo ? (
            "Resend verification link"
          ) : (
            "Send verification link"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        <Link
          to="/signin"
          className="inline-flex items-center gap-1.5 font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
        >
          <LuArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
