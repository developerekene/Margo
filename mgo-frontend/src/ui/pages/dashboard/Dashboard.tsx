import { useEffect } from "react";

import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../../Redux/Store";
import { logout } from "../../../Redux/Slices/authslic";

import { MargoLogo } from "../../Components/MargoLogo";
import { useNavigate } from "react-router-dom";

const STATS = [
  { label: "Conversations", value: "0" },
  { label: "Resolved automatically", value: "—" },
  { label: "Knowledge sources", value: "0" },
];

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const user = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate("/signin");
    }
  }, [isAuthenticated, user, navigate]);

  function signOut() {
    dispatch(logout());
    navigate("/signin");
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
        <MargoLogo />
        <div className="flex items-center gap-4">
          <span className="hidden text-[13px] text-ink-500 sm:block">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-900 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-900">
          Welcome, {user?.adminName}
        </h1>
        <p className="mt-2 text-[14px] text-ink-500">
          Your Margo workspace is ready. Connect a knowledge source to launch
          your assistant.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-line bg-white p-4"
            >
              <p className="text-[11px] font-medium tracking-[0.06em] text-ink-400 uppercase">
                {stat.label}
              </p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-ink-900">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
