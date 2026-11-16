import { useState } from "react";
import type { FormEvent } from "react";

import { LuArrowLeft, LuCircleCheck } from "react-icons/lu";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { AuthLayout } from "../../Components/AuthLayout";
import { LockIcon, Spinner } from "../../Components/Icons";
import { TextField } from "../../Components/TextField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/**
 * Forgot-password screen — matches the signup/signin card. There is no reset
 * endpoint yet, so submitting simulates the request and confirms with a toast.
 */
export default function ForgetPassword() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const trimmed = email.trim();
  const error = !trimmed
    ? "Enter the email on your Margo account."
    : !EMAIL_PATTERN.test(trimmed)
      ? "Enter a valid email address, e.g. name@company.com."
      : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);

    if (error || submitting) return;

    setSubmitting(true);

    try {
      // Placeholder for POST /identity/password-reset.
      await new Promise((resolve) => setTimeout(resolve, 900));

      setSentTo(trimmed);
      toast.success("Reset link sent", {
        id: "password-reset",
        description: `We emailed a password reset link to ${trimmed}.`,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          <LockIcon className="h-3.5 w-3.5 text-brand-500" />
          We only use this email to send the reset link.
        </>
      }
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        Reset your password
      </h1>
      <p className="mt-2 text-[14px] text-ink-500">
        Enter the email tied to your Margo workspace and we&rsquo;ll send you a
        secure reset link.
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
            reset link to {sentTo}. It expires in 30 minutes.
            <Link
              to={`/reset-password?token=demo&email=${encodeURIComponent(
                sentTo ?? "",
              )}`}
              className="mt-1.5 block font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              Open the reset link (demo)
            </Link>
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
          }}
          onBlur={() => setTouched(true)}
        />

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
            "Resend reset link"
          ) : (
            "Send reset link"
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
