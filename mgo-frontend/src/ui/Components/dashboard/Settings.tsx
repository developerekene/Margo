import { useEffect, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type { IconType } from "react-icons";
import {
  LuBell,
  LuBuilding2,
  LuEye,
  LuEyeOff,
  LuLock,
  LuSave,
  LuTrash2,
  LuTriangleAlert,
  LuUser,
  LuX,
} from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  logout,
  passwordChanged,
  profileUpdated,
} from "../../../Redux/Slices/authslic";
import type { RootState } from "../../../Redux/Store";
import { TextField } from "../TextField";

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD = "rounded-xl border border-line bg-white shadow-soft";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const DANGER_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:bg-red-300";

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type NotificationKey =
  | "newConversations"
  | "billingAlerts"
  | "productUpdates"
  | "weeklyDigest";

type NotificationPrefs = Record<NotificationKey, boolean>;

type WorkspaceSettings = {
  adminName: string;
  companyName: string;
  websiteUrl: string;
  timezone: string;
  notifications: NotificationPrefs;
};

type ProfilePatch = {
  adminName?: string;
  companyName?: string;
  websiteUrl?: string;
};

type WorkspaceErrors = {
  companyName?: string;
  websiteUrl?: string;
};

type PasswordErrors = {
  current?: string;
  next?: string;
  confirm?: string;
};

type PasswordForm = {
  current: string;
  next: string;
  confirm: string;
};

const STORAGE_KEY = "margo:settings";

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  newConversations: true,
  billingAlerts: true,
  productUpdates: false,
  weeklyDigest: true,
};

const NOTIFICATION_OPTIONS: {
  key: NotificationKey;
  label: string;
  description: string;
}[] = [
  {
    key: "newConversations",
    label: "New conversations",
    description: "Email me when a visitor starts a chat with my assistant.",
  },
  {
    key: "billingAlerts",
    label: "Billing alerts",
    description: "Receipts, failed charges and renewal reminders.",
  },
  {
    key: "productUpdates",
    label: "Product updates",
    description: "New Margo features and improvements, about once a month.",
  },
  {
    key: "weeklyDigest",
    label: "Weekly digest",
    description: "A Monday summary of your assistant's performance.",
  },
];

const TIMEZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const EMPTY_PASSWORD_FORM: PasswordForm = {
  current: "",
  next: "",
  confirm: "",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
}

function normaliseWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mergeNotifications(
  value: unknown,
  fallback: NotificationPrefs,
): NotificationPrefs {
  if (!value || typeof value !== "object") return fallback;

  const record = value as Record<string, unknown>;

  return {
    newConversations:
      typeof record.newConversations === "boolean"
        ? record.newConversations
        : fallback.newConversations,
    billingAlerts:
      typeof record.billingAlerts === "boolean"
        ? record.billingAlerts
        : fallback.billingAlerts,
    productUpdates:
      typeof record.productUpdates === "boolean"
        ? record.productUpdates
        : fallback.productUpdates,
    weeklyDigest:
      typeof record.weeklyDigest === "boolean"
        ? record.weeklyDigest
        : fallback.weeklyDigest,
  };
}

function loadSettings(
  user: RootState["auth"]["user"],
): WorkspaceSettings {
  const fallback: WorkspaceSettings = {
    adminName: user?.adminName ?? "",
    companyName: user?.companyName ?? "",
    websiteUrl: user?.websiteUrl ?? "",
    timezone: defaultTimezone(),
    notifications: { ...DEFAULT_NOTIFICATIONS },
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>;

    return {
      adminName:
        typeof parsed.adminName === "string" && parsed.adminName.trim()
          ? parsed.adminName
          : fallback.adminName,
      companyName:
        typeof parsed.companyName === "string" && parsed.companyName.trim()
          ? parsed.companyName
          : fallback.companyName,
      websiteUrl:
        typeof parsed.websiteUrl === "string"
          ? parsed.websiteUrl
          : fallback.websiteUrl,
      timezone:
        typeof parsed.timezone === "string" && parsed.timezone
          ? parsed.timezone
          : fallback.timezone,
      notifications: mergeNotifications(
        parsed.notifications,
        fallback.notifications,
      ),
    };
  } catch {
    return fallback;
  }
}

function persistSettings(settings: WorkspaceSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — keep working in memory.
  }
}

function clearWorkspaceStorage() {
  try {
    const keys: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("margo:")) keys.push(key);
    }

    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  icon: IconType;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={CARD}>
      <div className="flex items-start gap-3 border-b border-line p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
            {description}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">{children}</div>

      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-ink-700"
      >
        {label}
      </label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-line bg-white px-3 text-[14px] text-ink-900 outline-none transition-colors hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
      >
        {children}
      </select>

      {hint ? <p className="mt-1.5 text-[12.5px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

function PasswordField({
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      error={error}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          {visible ? (
            <LuEyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <LuEye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`flex w-full items-start justify-between gap-4 rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        checked
          ? "border-brand-500 bg-brand-500/10"
          : "border-line hover:border-line-strong"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink-900">
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-400">
          {description}
        </span>
      </span>

      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand-500" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Settings — workspace profile, notification preferences, password and the
 * danger zone. Profile edits update the auth slice (so the sidebar follows);
 * everything is persisted to `localStorage["margo:settings"]` until the API
 * lands.
 */
export function Settings() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);

  const [settings, setSettings] = useState<WorkspaceSettings>(() =>
    loadSettings(user),
  );
  const [workspaceErrors, setWorkspaceErrors] = useState<WorkspaceErrors>({});
  const [profileError, setProfileError] = useState<string | undefined>();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(
    EMPTY_PASSWORD_FORM,
  );
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Re-apply a saved profile on reload so the shell shows the same name.
  useEffect(() => {
    if (!user) return;

    const patch: ProfilePatch = {};
    if (settings.adminName && settings.adminName !== user.adminName)
      patch.adminName = settings.adminName;
    if (settings.companyName && settings.companyName !== user.companyName)
      patch.companyName = settings.companyName;
    if (settings.websiteUrl !== user.websiteUrl)
      patch.websiteUrl = settings.websiteUrl;

    if (Object.keys(patch).length > 0) dispatch(profileUpdated(patch));
  }, [
    dispatch,
    user,
    settings.adminName,
    settings.companyName,
    settings.websiteUrl,
  ]);

  // Escape closes the delete dialog and the page behind it stops scrolling.
  useEffect(() => {
    if (!deleteOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDeleteOpen(false);
    }

    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteOpen]);

  function updateSettings(patch: Partial<WorkspaceSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    return next;
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const adminName = settings.adminName.trim();

    if (!adminName) {
      setProfileError("Enter your full name.");
      return;
    }
    if (adminName.length > 80) {
      setProfileError("Keep your name under 80 characters.");
      return;
    }

    setProfileError(undefined);

    const next = updateSettings({ adminName });
    persistSettings(next);
    dispatch(profileUpdated({ adminName }));

    toast.success("Profile updated", {
      description: "Your name was saved across your workspace.",
    });
  }

  function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const companyName = settings.companyName.trim();
    const websiteUrl = normaliseWebsite(settings.websiteUrl);
    const nextErrors: WorkspaceErrors = {};

    if (!companyName) nextErrors.companyName = "Enter your workspace name.";
    else if (companyName.length > 80)
      nextErrors.companyName = "Keep the name under 80 characters.";

    if (websiteUrl && !isWebUrl(websiteUrl))
      nextErrors.websiteUrl = "Enter a valid website, e.g. https://margo.ai.";

    setWorkspaceErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const next = updateSettings({ companyName, websiteUrl });
    persistSettings(next);
    dispatch(profileUpdated({ companyName, websiteUrl }));

    toast.success("Workspace updated", {
      description: "Your workspace details were saved.",
    });
  }

  function toggleNotification(key: NotificationKey) {
    const next = updateSettings({
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });

    persistSettings(next);
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const current = passwordForm.current;
    const nextPassword = passwordForm.next;
    const nextErrors: PasswordErrors = {};

    if (!current) nextErrors.current = "Enter your current password.";
    else if (user?.password && current !== user.password)
      nextErrors.current = "That doesn't match your current password.";

    if (!nextPassword) nextErrors.next = "Enter a new password.";
    else if (nextPassword.length < 8)
      nextErrors.next = "Use at least 8 characters.";
    else if (nextPassword === current)
      nextErrors.next = "Choose a password you haven't used here.";

    if (!passwordForm.confirm)
      nextErrors.confirm = "Re-enter your new password.";
    else if (passwordForm.confirm !== nextPassword)
      nextErrors.confirm = "Passwords don't match.";

    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    dispatch(passwordChanged({ password: nextPassword }));
    setPasswordForm(EMPTY_PASSWORD_FORM);

    toast.success("Password updated", {
      description: "You'll stay signed in on this device.",
    });
  }

  function deleteWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = settings.companyName.trim();
    if (!name || deleteConfirm.trim().toLowerCase() !== name.toLowerCase())
      return;

    clearWorkspaceStorage();
    dispatch(logout());

    toast.success("Workspace deleted", {
      description: "Your workspace and its data were removed.",
    });

    navigate("/signin");
  }

  const timezoneOptions = Array.from(
    new Set([settings.timezone, ...TIMEZONES]),
  );
  const canDelete =
    Boolean(settings.companyName.trim()) &&
    deleteConfirm.trim().toLowerCase() ===
      settings.companyName.trim().toLowerCase();

  return (
    <div className="space-y-5">
      {/* Profile */}
      <form onSubmit={saveProfile}>
        <SettingsCard
          icon={LuUser}
          title="Your profile"
          description="This is how you appear to teammates across the workspace."
          footer={
            <>
              <span className="text-[12px] text-ink-400">
                Your email is used for sign-in and billing receipts.
              </span>

              <button type="submit" className={PRIMARY_BUTTON}>
                <LuSave className="h-4 w-4" aria-hidden="true" />
                Save profile
              </button>
            </>
          }
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[15px] font-semibold text-white">
              {initials(settings.adminName || user?.adminName || "")}
            </span>

            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink-900">
                {settings.adminName || "Workspace owner"}
              </p>
              <p className="truncate text-[12px] text-ink-400">
                {user?.email ?? "owner@example.com"}
              </p>
            </div>

            <span className="ml-auto shrink-0 rounded-full bg-[#ffeacf] px-2.5 py-0.5 text-[11px] font-medium text-brand-800">
              Owner
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              value={settings.adminName}
              placeholder="e.g. Amina Bello"
              autoComplete="name"
              error={profileError}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  adminName: event.target.value,
                }))
              }
            />

            <TextField
              label="Email address"
              value={user?.email ?? ""}
              disabled
              hint="Contact support to change the email on your account."
            />
          </div>
        </SettingsCard>
      </form>

      {/* Workspace */}
      <form onSubmit={saveWorkspace}>
        <SettingsCard
          icon={LuBuilding2}
          title="Workspace"
          description="Details your assistant uses when it talks about your business."
          footer={
            <>
              <span className="text-[12px] text-ink-400">
                Plans and invoices live in{" "}
                <Link
                  to="/dashboard/billing"
                  className="font-medium text-brand-700 hover:underline"
                >
                  Billing
                </Link>
                .
              </span>

              <button type="submit" className={PRIMARY_BUTTON}>
                <LuSave className="h-4 w-4" aria-hidden="true" />
                Save workspace
              </button>
            </>
          }
        >
          <TextField
            label="Workspace name"
            value={settings.companyName}
            placeholder="e.g. Margo Studio"
            error={workspaceErrors.companyName}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                companyName: event.target.value,
              }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Website"
              value={settings.websiteUrl}
              placeholder="https://example.com"
              autoComplete="url"
              error={workspaceErrors.websiteUrl}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  websiteUrl: event.target.value,
                }))
              }
            />

            <SelectField
              label="Time zone"
              hint="Used for digests, reports and billing dates."
              value={settings.timezone}
              onChange={(timezone) =>
                persistSettings(updateSettings({ timezone }))
              }
            >
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace("_", " ")}
                </option>
              ))}
            </SelectField>
          </div>
        </SettingsCard>
      </form>

      {/* Notifications */}
      <SettingsCard
        icon={LuBell}
        title="Notifications"
        description="Choose which workspace emails land in your inbox."
        footer={
          <span className="text-[12px] text-ink-400">
            Preferences save automatically. Transactional receipts are always
            sent.
          </span>
        }
      >
        <div className="space-y-2.5">
          {NOTIFICATION_OPTIONS.map((option) => (
            <ToggleRow
              key={option.key}
              label={option.label}
              description={option.description}
              checked={settings.notifications[option.key]}
              onChange={() => toggleNotification(option.key)}
            />
          ))}
        </div>
      </SettingsCard>

      {/* Password */}
      <form onSubmit={changePassword}>
        <SettingsCard
          icon={LuLock}
          title="Password"
          description="Use at least 8 characters and something you don't reuse."
          footer={
            <>
              <span className="text-[12px] text-ink-400">
                You'll stay signed in on this device.
              </span>

              <button type="submit" className={PRIMARY_BUTTON}>
                <LuSave className="h-4 w-4" aria-hidden="true" />
                Update password
              </button>
            </>
          }
        >
          <PasswordField
            label="Current password"
            value={passwordForm.current}
            error={passwordErrors.current}
            autoComplete="current-password"
            onChange={(value) =>
              setPasswordForm((current) => ({
                ...current,
                current: value,
              }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              label="New password"
              value={passwordForm.next}
              error={passwordErrors.next}
              autoComplete="new-password"
              onChange={(value) =>
                setPasswordForm((current) => ({ ...current, next: value }))
              }
            />

            <PasswordField
              label="Confirm new password"
              value={passwordForm.confirm}
              error={passwordErrors.confirm}
              autoComplete="new-password"
              onChange={(value) =>
                setPasswordForm((current) => ({ ...current, confirm: value }))
              }
            />
          </div>
        </SettingsCard>
      </form>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-white shadow-soft">
        <div className="flex items-start gap-3 border-b border-red-100 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <LuTriangleAlert className="h-4.5 w-4.5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-red-700">
              Danger zone
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
              Irreversible actions for this workspace.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-md text-[12.5px] leading-relaxed text-ink-500">
            Deleting{" "}
            <span className="font-medium text-ink-700">
              {settings.companyName.trim() || "this workspace"}
            </span>{" "}
            removes every agent, knowledge source, teammate and billing record.
            This can't be undone.
          </p>

          <button
            type="button"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <LuTrash2 className="h-4 w-4" aria-hidden="true" />
            Delete workspace
          </button>
        </div>
      </section>

      {/* Delete confirmation */}
      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div
            aria-hidden="true"
            onClick={() => setDeleteOpen(false)}
            className="absolute inset-0 bg-ink-900/30"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-title"
            className="relative w-full max-w-md rounded-2xl border border-line bg-white shadow-card"
          >
            <form onSubmit={deleteWorkspace}>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <LuTriangleAlert className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>

                  <div className="min-w-0">
                    <h2
                      id="delete-workspace-title"
                      className="text-[15px] font-semibold text-ink-900"
                    >
                      Delete workspace
                    </h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                      This removes every agent, source and teammate in this
                      workspace.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  aria-label="Close dialog"
                  className={ICON_BUTTON}
                >
                  <LuX className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="px-5 py-5">
                <TextField
                  label={`Type ${
                    settings.companyName.trim() || "the workspace name"
                  } to confirm`}
                  value={deleteConfirm}
                  autoFocus
                  hint="This action can't be undone."
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  className={SECONDARY_BUTTON}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!canDelete}
                  className={DANGER_BUTTON}
                >
                  <LuTrash2 className="h-4 w-4" aria-hidden="true" />
                  Delete workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
