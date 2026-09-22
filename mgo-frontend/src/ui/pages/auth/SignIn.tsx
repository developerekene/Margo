import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, continueWithGoogle, signIn } from "../../../api/auth";
import { AuthLayout } from "../../Components/AuthLayout";
import { FormAlert } from "../../Components/FormAlert";
import {
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  LockIcon,
  Spinner,
} from "../../Components/Icons";
import { TextField } from "../../Components/TextField";

type FieldName = "email" | "password";
type FormValues = Record<FieldName, string>;
type Provider = "email" | "google";

const EMPTY_VALUES: FormValues = { email: "", password: "" };
const FIELD_ORDER: FieldName[] = ["email", "password"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function validate(values: FormValues) {
  const errors: Partial<Record<FieldName, string>> = {};

  const email = values.email.trim();
  if (!email) {
    errors.email = "Enter your work email address.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, e.g. name@company.com.";
  }

  if (!values.password) {
    errors.password = "Enter your password.";
  }

  return errors;
}

export default function SignIn() {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("email");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const errors = validate(values);
  const errorFor = (name: FieldName) =>
    touched[name] ? errors[name] : undefined;

  const handleChange =
    (name: FieldName) => (event: ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [name]: event.target.value }));

  const markTouched = (name: FieldName) => () =>
    setTouched((prev) => ({ ...prev, [name]: true }));

  async function submit(method: Provider) {
    setProvider(method);
    setSubmitting(true);
    setFormError(null);

    try {
      if (method === "google") {
        await continueWithGoogle();
      } else {
        await signIn({ email: values.email.trim(), password: values.password });
      }
      navigate("/dashboard");
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setTouched({ email: true, password: true });

    const firstInvalid = FIELD_ORDER.find((key) => errors[key]);
    if (!firstInvalid) {
      void submit("email");
      return;
    }

    const field = event.currentTarget.elements.namedItem(firstInvalid);
    if (field instanceof HTMLInputElement) field.focus();
  }

  return (
    <AuthLayout
      footer={
        <>
          <LockIcon className="h-3.5 w-3.5 text-brand-500" />
          Your workspace data stays private to your team.
        </>
      }
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        Sign in to Margo
      </h1>
      <p className="mt-2 text-[14px] text-ink-500">
        Welcome back — pick up where you left off.
      </p>

      <form className="mt-7 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={values.email}
          error={errorFor("email")}
          disabled={submitting}
          loading={submitting}
          onChange={handleChange("email")}
          onBlur={markTouched("email")}
        />

        <TextField
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Your password"
          value={values.password}
          error={errorFor("password")}
          disabled={submitting}
          loading={submitting}
          trailing={
            submitting ? undefined : (
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
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
          onChange={handleChange("password")}
          onBlur={markTouched("password")}
        />

        {formError ? <FormAlert message={formError} /> : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-500 disabled:opacity-60"
        >
          {submitting && provider === "email" ? (
            <>
              <Spinner className="h-4 w-4" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>

        <div className="flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
            OR
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit("google")}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white text-[14px] font-medium text-ink-900 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && provider === "google" ? (
            <Spinner className="h-4 w-4 text-ink-500" />
          ) : (
            <GoogleIcon className="h-4.5 w-4.5" />
          )}
          Continue with Google
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-500">
        New to Margo?{" "}
        <button
          type="button"
          onClick={() => navigate("/signup")}
          className="font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
        >
          Create an account
        </button>
      </p>
    </AuthLayout>
  );
}
