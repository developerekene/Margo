import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { useSelector } from "react-redux";

import type { RootState } from "../../../Redux/Store";
import { TextField } from "../TextField";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type TeamRole = "admin" | "member";
type TeamPermission = "edit" | "delete" | "create" | "customize";
type TeamPermissions = Record<TeamPermission, boolean>;

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  permissions: TeamPermissions;
};

type MemberForm = Omit<TeamMember, "id">;

type FormErrors = {
  name?: string;
  email?: string;
};

const PERMISSIONS: {
  key: TeamPermission;
  label: string;
  hint: string;
}[] = [
  { key: "edit", label: "Edit chatbot", hint: "Change settings and content" },
  { key: "delete", label: "Delete", hint: "Remove agents and sources" },
  { key: "create", label: "Create", hint: "Create new agents" },
  {
    key: "customize",
    label: "Customize",
    hint: "Change the widget appearance",
  },
];

const FULL_ACCESS: TeamPermissions = {
  edit: true,
  delete: true,
  create: true,
  customize: true,
};

const NO_ACCESS: TeamPermissions = {
  edit: false,
  delete: false,
  create: false,
  customize: false,
};

const EMPTY_FORM: MemberForm = {
  name: "",
  email: "",
  role: "member",
  permissions: { ...NO_ACCESS },
};

const STORAGE_KEY = "margo:team";

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

function seedMembers(user: RootState["auth"]["user"]): TeamMember[] {
  return [
    {
      id: "owner",
      name: user?.adminName ?? "Workspace owner",
      email: user?.email ?? "owner@example.com",
      role: "admin",
      permissions: { ...FULL_ACCESS },
    },
    {
      id: "member-1",
      name: "Lina Okafor",
      email: "lina.okafor@example.com",
      role: "member",
      permissions: {
        edit: true,
        delete: false,
        create: false,
        customize: true,
      },
    },
    {
      id: "member-2",
      name: "Tunde Bello",
      email: "tunde.bello@example.com",
      role: "member",
      permissions: {
        edit: false,
        delete: false,
        create: true,
        customize: false,
      },
    },
  ];
}

function loadMembers(fallback: TeamMember[]): TeamMember[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TeamMember[]) : fallback;
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function RoleBadge({ role }: { role: TeamRole }) {
  const admin = role === "admin";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium capitalize ${
        admin
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-line bg-slate-50 text-ink-500"
      }`}
    >
      {role}
    </span>
  );
}

function AccessList({ member }: { member: TeamMember }) {
  if (member.role === "admin") {
    return (
      <span className="text-[12px] font-medium text-brand-700">
        Full access
      </span>
    );
  }

  const enabled = PERMISSIONS.filter(
    (permission) => member.permissions[permission.key],
  );

  if (!enabled.length) {
    return <span className="text-[12px] text-ink-400">View only</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {enabled.map((permission) => (
        <span
          key={permission.key}
          className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] text-ink-500"
        >
          {permission.label}
        </span>
      ))}
    </div>
  );
}

function PermissionToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "border-brand-500 bg-brand-500/10"
          : "border-line hover:border-line-strong"
      }`}
    >
      <span>
        <span className="block text-[13px] font-medium text-ink-900">
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-400">{hint}</span>
      </span>

      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
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

/** Team — the member list plus a create/edit dialog for roles and access. */
export function Team() {
  const user = useSelector((state: RootState) => state.auth.user);

  const [members, setMembers] = useState<TeamMember[]>(() =>
    loadMembers(seedMembers(user)),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  // Keep the team list between visits.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
    } catch {
      // Storage unavailable — keep working in memory.
    }
  }, [members]);

  // Escape closes the dialog and the page behind it stops scrolling.
  useEffect(() => {
    if (!dialogOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDialogOpen(false);
    }

    window.addEventListener("keydown", handleKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialogOpen]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, permissions: { ...NO_ACCESS } });
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(member: TeamMember) {
    setEditingId(member.id);
    setForm({
      name: member.name,
      email: member.email,
      role: member.role,
      permissions: { ...member.permissions },
    });
    setErrors({});
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function changeRole(role: TeamRole) {
    setForm((current) => ({
      ...current,
      role,
      permissions: role === "admin" ? { ...FULL_ACCESS } : { ...NO_ACCESS },
    }));
  }

  function togglePermission(key: TeamPermission) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions[key],
      },
    }));
  }

  function saveMember() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const nextErrors: FormErrors = {};

    if (!name) nextErrors.name = "Enter the member's name.";
    if (!email) nextErrors.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = "Enter a valid email address.";
    else if (
      members.some(
        (member) =>
          member.id !== editingId && member.email.toLowerCase() === email,
      )
    )
      nextErrors.email = "That email is already on the team.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (editingId) {
      setMembers((current) =>
        current.map((member) =>
          member.id === editingId
            ? { ...member, ...form, name, email }
            : member,
        ),
      );
    } else {
      setMembers((current) => [
        ...current,
        { id: crypto.randomUUID(), ...form, name, email },
      ]);
    }

    setDialogOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMember();
  }

  function deleteMember(member: TeamMember) {
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;
    setMembers((current) => current.filter((item) => item.id !== member.id));
  }

  const isAdmin = form.role === "admin";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Team members
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              {members.length} {members.length === 1 ? "member" : "members"} in
              this workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Create member
          </button>
        </div>

        <div className="border-t border-line">
          {members.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Member", "Role", "Access", "Action"].map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-slate-50/70"
                    >
                      <th scope="row" className="px-4 py-3 text-left">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700">
                            {initials(member.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-ink-900">
                              {member.name}
                            </span>
                            <span className="block truncate text-[12px] text-ink-400">
                              {member.email}
                            </span>
                          </span>
                        </div>
                      </th>

                      <td className="px-4 py-3">
                        <RoleBadge role={member.role} />
                      </td>

                      <td className="px-4 py-3">
                        <AccessList member={member} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(member)}
                            aria-label={`Edit ${member.name}`}
                            title="Edit"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:border-brand-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                          >
                            <LuPencil className="h-4 w-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteMember(member)}
                            aria-label={`Delete ${member.name}`}
                            title="Delete"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                          >
                            <LuTrash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No team members yet. Create your first teammate.
            </p>
          )}
        </div>
      </section>

      {/* Create / edit dialog */}
      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div
            aria-hidden="true"
            onClick={closeDialog}
            className="absolute inset-0 bg-ink-900/30"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-dialog-title"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-white shadow-card"
          >
            <form onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2
                    id="member-dialog-title"
                    className="text-[15px] font-semibold text-ink-900"
                  >
                    {editingId ? "Edit team member" : "Create team member"}
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                    {editingId
                      ? "Update this teammate's role and access."
                      : "Add a teammate and choose what they can do."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDialog}
                  aria-label="Close dialog"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <LuX className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                <TextField
                  label="Full name"
                  value={form.name}
                  placeholder="e.g. Amina Bello"
                  error={errors.name}
                  autoFocus
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />

                <TextField
                  label="Email address"
                  type="email"
                  value={form.email}
                  placeholder="name@company.com"
                  error={errors.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />

                <div>
                  <label
                    htmlFor="member-role"
                    className="mb-1.5 block text-[13px] font-medium text-ink-700"
                  >
                    Role
                  </label>
                  <select
                    id="member-role"
                    value={form.role}
                    onChange={(event) =>
                      changeRole(event.target.value as TeamRole)
                    }
                    className="h-11 w-full rounded-lg border border-line bg-white px-3.5 text-[14px] text-ink-900 outline-none transition-colors hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <p className="mt-1.5 text-[12.5px] text-ink-400">
                    Admins always have full access.
                  </p>
                </div>

                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-ink-700">
                    Access
                  </legend>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {PERMISSIONS.map((permission) => (
                      <PermissionToggle
                        key={permission.key}
                        label={permission.label}
                        hint={permission.hint}
                        checked={form.permissions[permission.key]}
                        disabled={isAdmin}
                        onChange={() => togglePermission(permission.key)}
                      />
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {editingId ? "Save changes" : "Create member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
