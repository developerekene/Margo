import { useId, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { ApiError, signUp } from "../../../api/auth";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../../Components/AuthLayout";
import { FormAlert } from "../../Components/FormAlert";
import {
  AlertCircleIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  Spinner,
} from "../../Components/Icons";
import { TextField } from "../../Components/TextField";

type FieldName =
  | "admin name"
  | "company name"
  | "website url"
  | "email"
  | "password"
  | "confirmPassword";

type FieldKey = FieldName | "terms";
type FormValues = Record<FieldName, string>;
type FormErrors = Partial<Record<FieldKey, string>>;
type Provider = "email" | "google";

/** Order used to focus the first invalid field on submit. */
const FIELD_ORDER: FieldKey[] = [
  "admin name",
  "company name",
  "website url",
  "email",
  "password",
  "confirmPassword",
  "terms",
];

const EMPTY_VALUES: FormValues = {
  "admin name": "",
  "company name": "",
  "website url": "",
  email: "",
  password: "",
  confirmPassword: "",
};

/** The plain text inputs — the password fields are rendered separately. */
const FIELDS = [
  {
    name: "admin name",
    label: "Admin name",
    type: "text",
    autoComplete: "name",
    placeholder: "Ada Lovelace",
  },
  {
    name: "company name",
    label: "Company name",
    type: "text",
    autoComplete: "organization",
    placeholder: "Acme Inc.",
  },
  {
    name: "website url",
    label: "Website URL",
    type: "url",
    autoComplete: "url",
    placeholder: "https://example.com",
  },
  {
    name: "email",
    label: "Work email",
    type: "email",
    autoComplete: "email",
    placeholder: "you@company.com",
  },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_LEVELS = [
  "Too short",
  "Weak",
  "Fair",
  "Good",
  "Strong",
] as const;
const PASSWORD_BAR_COLORS = [
  "bg-red-400",
  "bg-red-400",
  "bg-amber-400",
  "bg-brand-400",
  "bg-brand-500",
];
const PASSWORD_TEXT_COLORS = [
  "text-red-600",
  "text-red-600",
  "text-amber-600",
  "text-brand-600",
  "text-brand-700",
];

/** 0 = too short, 1 = weak … 4 = strong. */
function passwordStrength(password: string) {
  if (!password) return 0;

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return score;
}

function validate(values: FormValues, agreedToTerms: boolean): FormErrors {
  const errors: FormErrors = {};

  if (!values["admin name"].trim()) {
    errors["admin name"] = "Enter your full name.";
  } else if (values["admin name"].trim().length < 2) {
    errors["admin name"] = "Enter at least 2 characters.";
  }

  if (!values["company name"].trim()) {
    errors["company name"] = "Enter your company name.";
  }

  if (!values["website url"].trim()) {
    errors["website url"] = "Enter your website URL.";
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "Enter your work email address.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, e.g. name@company.com.";
  }

  if (!values.password) {
    errors.password = "Create a password.";
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Re-enter your password.";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (!agreedToTerms) {
    errors.terms =
      "Please accept the Terms of Service and Privacy Policy to continue.";
  }

  return errors;
}

export default function Signup() {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("email");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const termsErrorId = useId();
  const navigate = useNavigate();

  const errors = useMemo(
    () => validate(values, agreedToTerms),
    [values, agreedToTerms],
  );
  const strength = passwordStrength(values.password);
  const termsError = touched.terms ? errors.terms : undefined;

  const errorFor = (name: FieldName) =>
    touched[name] ? errors[name] : undefined;

  const handleChange =
    (name: FieldName) => (event: ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [name]: event.target.value }));

  const markTouched = (name: FieldKey) => () =>
    setTouched((prev) => ({ ...prev, [name]: true }));

  async function submit(method: Provider) {
    setProvider(method);
    setSubmitting(true);
    setFormError(null);

    try {
      await signUp({
        adminName: values["admin name"].trim(),
        companyName: values["company name"].trim(),
        websiteUrl: values["website url"].trim(),
        email: values.email.trim(),
        password: values.password,
      });
      navigate("/signin");
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

    const nextErrors = validate(values, agreedToTerms);
    setTouched({
      "admin name": true,
      "company name": true,
      "website url": true,
      email: true,
      password: true,
      confirmPassword: true,
      terms: true,
    });

    const firstInvalid = FIELD_ORDER.find((key) => nextErrors[key]);

    if (!firstInvalid) {
      void submit("email");
      return;
    }

    if (firstInvalid !== "terms") {
      const field = event.currentTarget.elements.namedItem(firstInvalid);
      if (field instanceof HTMLInputElement) field.focus();
    }
  }

  const passwordToggle = (
    visible: boolean,
    onToggle: () => void,
    label: string,
  ) => (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={visible}
      disabled={submitting}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:text-ink-400"
    >
      {visible ? (
        <EyeOffIcon className="h-4.5 w-4.5" />
      ) : (
        <EyeIcon className="h-4.5 w-4.5" />
      )}
    </button>
  );

  return (
    <AuthLayout
      footer={
        <>
          <CheckIcon className="h-3.5 w-3.5 text-brand-500" />
          Free 14-day trial · No credit card required
        </>
      }
    >
      <h1 className="text-[24px] font-semibold tracking-tight text-ink-900 sm:text-[26px]">
        Create your Margo account
      </h1>
      <p className="mt-2 text-[14px] text-ink-500">
        Start building your AI-powered website assistant.
      </p>

      <form className="mt-7 space-y-4" noValidate onSubmit={handleSubmit}>
        {FIELDS.map((field) => (
          <TextField
            key={field.name}
            name={field.name}
            label={field.label}
            type={field.type}
            autoComplete={field.autoComplete}
            placeholder={field.placeholder}
            value={values[field.name]}
            error={errorFor(field.name)}
            disabled={submitting}
            loading={submitting}
            onChange={handleChange(field.name)}
            onBlur={markTouched(field.name)}
          />
        ))}

        <div className="space-y-2">
          <TextField
            name="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={values.password}
            hint="Use 8+ characters with a mix of letters, numbers and symbols."
            error={errorFor("password")}
            disabled={submitting}
            loading={submitting}
            trailing={
              submitting
                ? undefined
                : passwordToggle(
                    showPassword,
                    () => setShowPassword((prev) => !prev),
                    showPassword ? "Hide password" : "Show password",
                  )
            }
            onChange={handleChange("password")}
            onBlur={markTouched("password")}
          />

          {values.password ? (
            <div className="flex items-center gap-2.5" aria-hidden="true">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      index < strength
                        ? PASSWORD_BAR_COLORS[strength]
                        : "bg-line"
                    }`}
                  />
                ))}
              </div>
              <span
                className={`text-[11.5px] font-medium ${PASSWORD_TEXT_COLORS[strength]}`}
              >
                {PASSWORD_LEVELS[strength]}
              </span>
            </div>
          ) : null}
        </div>

        <TextField
          name="confirmPassword"
          label="Confirm password"
          type={showConfirmPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={values.confirmPassword}
          error={errorFor("confirmPassword")}
          disabled={submitting}
          loading={submitting}
          trailing={
            submitting
              ? undefined
              : passwordToggle(
                  showConfirmPassword,
                  () => setShowConfirmPassword((prev) => !prev),
                  showConfirmPassword ? "Hide password" : "Show password",
                )
          }
          onChange={handleChange("confirmPassword")}
          onBlur={markTouched("confirmPassword")}
        />

        <div className="pt-1">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="terms"
              checked={agreedToTerms}
              disabled={submitting}
              aria-invalid={Boolean(termsError) || undefined}
              aria-describedby={termsError ? termsErrorId : undefined}
              onChange={(event) => {
                setAgreedToTerms(event.target.checked);
                setTouched((prev) => ({ ...prev, terms: true }));
              }}
              onBlur={markTouched("terms")}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed"
            />
            <span className="text-[13px] leading-relaxed text-ink-700">
              I agree to the{" "}
              <a
                href="#"
                className="font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>

          {termsError ? (
            <p
              id={termsErrorId}
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-[12.5px] text-red-600"
            >
              <AlertCircleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{termsError}</span>
            </p>
          ) : null}
        </div>

        {formError ? <FormAlert message={formError} /> : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-500 disabled:opacity-60"
        >
          {submitting && provider === "email" ? (
            <>
              <Spinner className="h-4 w-4" />
              Creating account…
            </>
          ) : (
            "Create account"
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
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/signin")}
          className="font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
        >
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}
