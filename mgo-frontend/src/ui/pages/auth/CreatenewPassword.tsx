import { useState } from "react";
import type { FormEvent } from "react";

import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AuthLayout } from "../../Components/AuthLayout";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  Spinner,
} from "../../Components/Icons";
import { TextField } from "../../Components/TextField";

const MIN_LENGTH = 8;

/**
 * "Create a new password" screen, opened from the reset email link
 * (`/reset-password?token=…&email=…`). Mobile-first: the shared `AuthLayout`
 * collapses to a single column below `lg`.
 */
export default function CreateNewPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const token = params.get("token");
  const email = params.get("email");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const rules = [
    {
      id: "length",
      label: `At least ${MIN_LENGTH} characters`,
      met: password.length >= MIN_LENGTH,
    },
    {
      id: "upper",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lower",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    { id: "number", label: "One number", met: /\d/.test(password) },
  ];

  const metCount = rules.filter((rule) => rule.met).length;
  const passwordValid = metCount === rules.length;

  const errors = {
    password: !password
      ? "Create a password."
      : !passwordValid
        ? "Your password doesn't meet all the requirements yet."
        : undefined,
    confirm: !confirm
      ? "Re-enter your password."
      : confirm !== password
        ? "Passwords don't match."
        : undefined,
  };

  const strengthLabel =
    metCount === 0 ? "" : metCount === 1 ? "Weak" : metCount === 2 ? "Fair" : metCount === 3 ? "Good" : "Strong";

  const strengthTone =
    metCount <= 1
      ? "bg-red-400"
      : metCount === 2
        ? "bg-amber-400"
        : metCount === 3
          ? "bg-brand-400"
          : "bg-brand-500";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ password: true, confirm: true });

    if (errors.password || errors.confirm || submitting) {
      const field = event.currentTarget.elements.namedItem(
        errors.password ? "password" : "confirm",
      );
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }

    setSubmitting(true);

    try {
      // Placeholder for POST /identity/password-reset/confirm.
      await new Promise((resolve) => setTimeout(resolve, 900));

      toast.success("Password updated", {
        description: "You can now sign in with your new password.",
      });
      navigate("/signin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          <LockIcon className="h-3.5 w-3.5 text-brand-500" />
          Your password is encrypted and never shared.
        </>
      }
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        Create a new password
      </h1>
      <p className="mt-2 text-[14px] text-ink-500">
        Choose a strong password for your Margo account. You&rsquo;ll use it the
        next time you sign in.
      </p>

      {token ? (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-medium text-brand-700">
          <CheckIcon className="h-3.5 w-3.5" />
          Reset link verified
          {email ? <span className="font-normal">for {email}</span> : null}
        </p>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800">
          This page is normally opened from the link in your reset email.{" "}
          <Link
            to="/forgot-password"
            className="font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Request a new link
          </Link>
          .
        </div>
      )}

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <div>
          <TextField
            name="password"
            label="New password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Enter a new password"
            value={password}
            error={touched.password ? errors.password : undefined}
            disabled={submitting}
            loading={submitting}
            trailing={
              submitting ? undefined : (
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4.5 w-4.5" />
                  ) : (
                    <EyeIcon className="h-4.5 w-4.5" />
                  )}
                </button>
              )
            }
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() =>
              setTouched((current) => ({ ...current, password: true }))
            }
          />

          {/* Strength */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-200 ${strengthTone}`}
                style={{ width: `${(metCount / rules.length) * 100}%` }}
              />
            </div>
            {strengthLabel ? (
              <span className="shrink-0 text-[11.5px] font-medium text-ink-500">
                {strengthLabel}
              </span>
            ) : null}
          </div>

          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-center gap-1.5 text-[11.5px] ${
                  rule.met ? "text-brand-700" : "text-ink-400"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    rule.met
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white"
                  }`}
                >
                  {rule.met ? (
                    <CheckIcon className="h-2.5 w-2.5" />
                  ) : null}
                </span>
                {rule.label}
              </li>
            ))}
          </ul>
        </div>

        <TextField
          name="confirm"
          label="Confirm password"
          type={showConfirm ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat your new password"
          value={confirm}
          error={touched.confirm ? errors.confirm : undefined}
          disabled={submitting}
          loading={submitting}
          trailing={
            submitting ? undefined : (
              <button
                type="button"
                onClick={() => setShowConfirm((value) => !value)}
                aria-label={
                  showConfirm ? "Hide confirmed password" : "Show confirmed password"
                }
                aria-pressed={showConfirm}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
              >
                {showConfirm ? (
                  <EyeOffIcon className="h-4.5 w-4.5" />
                ) : (
                  <EyeIcon className="h-4.5 w-4.5" />
                )}
              </button>
            )
          }
          onChange={(event) => setConfirm(event.target.value)}
          onBlur={() =>
            setTouched((current) => ({ ...current, confirm: true }))
          }
        />

        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-500 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" />
              Updating password…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        Remembered it?{" "}
        <Link
          to="/signin"
          className="font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
