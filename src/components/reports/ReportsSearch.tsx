"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export function ReportsSearch({ initialQuery }: { initialQuery: string }) {
  const t = useTranslations("reports");
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  const submit = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set("q", next);
    else sp.delete("q");
    startTransition(() => {
      router.replace(`?${sp.toString()}`);
    });
  };

  return (
    <div className="relative max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9 pr-9"
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          submit(e.target.value);
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          aria-label="clear"
        >
          <X size={14} />
        </button>
      )}
      {pending && (
        <span className="absolute -bottom-5 left-1 text-[10px] text-slate-400">
          {t("searching")}
        </span>
      )}
    </div>
  );
}
