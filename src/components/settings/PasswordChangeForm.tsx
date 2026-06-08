"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Labels = {
  newPassword: string;
  confirm: string;
  submit: string;
  success: string;
  mismatch: string;
  tooShort: string;
  error: string;
};

/**
 * Lets a logged-in user set a new password (Supabase auth.updateUser).
 * No current-password field — the active session authorizes the change,
 * which is what we want for participants who logged in with an issued
 * temporary password.
 */
export function PasswordChangeForm({ labels }: { labels: Labels }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (pw.length < 8) {
      setError(labels.tooShort);
      return;
    }
    if (pw !== confirm) {
      setError(labels.mismatch);
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await createClient().auth.updateUser({ password: pw });
      if (err) throw err;
      setDone(true);
      setPw("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-sm space-y-4">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          {labels.newPassword}
        </label>
        <input
          type="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setDone(false);
          }}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-500">
          {labels.confirm}
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setDone(false);
          }}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || pw.length === 0 || confirm.length === 0}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {labels.submit}
        </button>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check size={13} /> {labels.success}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-risk">{error}</p>}
    </form>
  );
}
