import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { useSelector } from "react-redux";
import { toast } from "sonner";

import {
  getApiErrorMessage,
  useInviteUserMutation,
  useListTenantUsersQuery,
  useRemoveUserMutation,
} from "../../../api/endpoints";
import type { InviteRequest, TenantUser } from "../../../api/endpoints";
import type { RootState } from "../../../Redux/Store";
import { TextField } from "../TextField";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type InviteRole = InviteRequest["role"];

type FormValues = {
  name: string;
  email: string;
  role: InviteRole;
};

type FormErrors = {
  name?: string;
  email?: string;
};

/** One page of the tenant member list. */
const PAGE_SIZE = 20;

const EMPTY_FORM: FormValues = {
  name: "",
  email: "",
  role: "company_member",
};

const ROLE_LABELS: Record<string, string> = {
  company_owner: "Owner",
  company_admin: "Admin",
  company_member: "Member",
  platform_admin: "Platform admin",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function initials(name: string) {
  const trimmed = (name ?? "").trim();

  if (!trimmed) return "?";

  return (
    trimmed
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

/** `created_at` arrives as an ISO string; fall back to the raw value. */
function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value || "—";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function RoleBadge({ role }: { role: string }) {
  const owner = role === "company_owner";
  const admin = role === "company_admin";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${
        owner
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : admin
            ? "border-line bg-white text-ink-700"
            : "border-line bg-slate-50 text-ink-500"
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}

/** `active` = accepted, `invited` = invitation still pending. */
function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const pending = status === "invited";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : pending
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-line bg-slate-50 text-ink-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-emerald-500" : pending ? "bg-amber-500" : "bg-ink-400"
        }`}
      />
      {active ? "Active" : pending ? "Pending" : status || "—"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Team — members of the signed-in tenant, served by
 * `GET /identity/{tenant_id}/users` in pages of 20.
 */
export function Team() {
  const tenantId = useSelector((state: RootState) => state.auth.tenant_id);
  const viewerRole = useSelector((state: RootState) => state.auth.role);
  const canManage =
    viewerRole === "company_owner" || viewerRole === "company_admin";

  // Cursor stack, so "Previous" can walk back through the pages.
  const [cursors, setCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading, isFetching, error, refetch } =
    useListTenantUsersQuery(
      {
        tenant_id: tenantId ?? "",
        limit: PAGE_SIZE,
        cursor: cursors[pageIndex],
      },
      { skip: !tenantId },
    );

  const [inviteUser, { isLoading: inviting }] = useInviteUserMutation();
  const [removeUser, { isLoading: removing }] = useRemoveUserMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  // Owner first, everything else in the order the backend returned.
  const members = useMemo(() => {
    const list = data?.users ?? [];
    const rank = (role: string) => (role === "company_owner" ? 0 : 1);

    return [...list].sort((a, b) => rank(a.role) - rank(b.role));
  }, [data]);
  const nextCursor = data?.next_cursor ?? null;
  const firstLoad = isLoading && !data;

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

  function openDialog() {
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function goNext() {
    if (!nextCursor) return;

    setCursors((current) => {
      const next = [...current];
      next[pageIndex + 1] = nextCursor;
      return next;
    });
    setPageIndex((index) => index + 1);
  }

  function goPrevious() {
    setPageIndex((index) => Math.max(0, index - 1));
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenantId || inviting) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const nextErrors: FormErrors = {};

    if (!name) nextErrors.name = "Enter the member's name.";
    if (!email) nextErrors.email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = "Enter a valid email address.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await inviteUser({
        tenant_id: tenantId,
        name,
        email,
        role: form.role,
      }).unwrap();

      setDialogOpen(false);
      setForm(EMPTY_FORM);
      toast.success("Invitation sent", {
        description: `${name} will receive an email at ${email} with a link to create their password.`,
        duration: 6000,
      });
    } catch (caught) {
      toast.error("Couldn't send the invitation", {
        description: getApiErrorMessage(caught),
      });
    }
  }

  async function removeMember(member: TenantUser) {
    if (!tenantId || removing) return;
    if (!window.confirm(`Remove ${member.name} from the team?`)) return;

    try {
      await removeUser({ tenant_id: tenantId, userId: member.uid }).unwrap();
      toast.success("Member removed", {
        description: `${member.name} no longer has access to this workspace.`,
      });
    } catch (caught) {
      toast.error("Couldn't remove the member", {
        description: getApiErrorMessage(caught),
      });
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Team members
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              People with access to this workspace. Invitations are emailed and
              the recipient sets their own password.
            </p>
          </div>

          <button
            type="button"
            onClick={openDialog}
            disabled={!tenantId || !canManage}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LuPlus className="h-4 w-4" aria-hidden="true" />
            Create member
          </button>
        </div>

        <div className="border-t border-line">
          {!tenantId ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              Sign in with a workspace account to manage the team.
            </p>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-[13px] text-ink-500">
                {getApiErrorMessage(error)}
              </p>

              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-lg border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Try again
              </button>
            </div>
          ) : firstLoad ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              Loading team members…
            </p>
          ) : members.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-200 border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {[
                      "Member",
                      "Role",
                      "Status",
                      "Invited by",
                      "Joined",
                      "Action",
                    ].map((column) => (
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
                      key={member.uid}
                      className="border-b border-line transition-colors last:border-0 hover:bg-slate-50/70"
                    >
                      <th scope="row" className="px-4 py-3 text-left">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700">
                            {initials(member.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-ink-900">
                              {member.name || "—"}
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
                        <StatusBadge status={member.status} />
                      </td>

                      <td className="px-4 py-3 text-[12.5px] text-ink-500">
                        <span className="block max-w-45 truncate">
                          {member.invited_by ?? "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[12.5px] text-ink-500">
                        {formatDate(member.created_at)}
                      </td>

                      <td className="px-4 py-3">
                        {canManage && member.role !== "company_owner" ? (
                          <button
                            type="button"
                            onClick={() => void removeMember(member)}
                            disabled={removing}
                            aria-label={`Remove ${member.name}`}
                            title="Remove access"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <LuTrash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="text-[12px] text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-[13px] text-ink-400">
              No team members yet. Invite your first teammate.
            </p>
          )}
        </div>

        {tenantId && !error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-[12px] text-ink-400">
              Page {pageIndex + 1} · {PAGE_SIZE} per page
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevious}
                disabled={pageIndex === 0 || isFetching}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={!nextCursor || isFetching}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Invite dialog */}
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
            <form onSubmit={handleInvite}>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2
                    id="member-dialog-title"
                    className="text-[15px] font-semibold text-ink-900"
                  >
                    Create team member
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                    We email an invitation with a secure link so they can create
                    their own password.
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
                      setForm((current) => ({
                        ...current,
                        role: event.target.value as InviteRole,
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-line bg-white px-3.5 text-[14px] text-ink-900 outline-none transition-colors hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                  >
                    <option value="company_member">Member</option>
                    <option value="company_admin">Admin</option>
                  </select>
                  <p className="mt-1.5 text-[12.5px] text-ink-400">
                    Admins can manage the team, agents and billing. Members can
                    use the workspace.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
                <span className="text-[12px] text-ink-400">
                  They&rsquo;ll get a link to create their password.
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-lg bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inviting ? "Sending invite…" : "Send invite"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
