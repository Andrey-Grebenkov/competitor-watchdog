"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ghostButton } from "@/lib/ui";

export function CheckNowButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/check`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        alertError?: string;
      } | null;
      if (!response.ok || body?.ok === false) {
        setError(body?.error ?? "Не удалось выполнить проверку");
        return;
      }
      if (body?.alertError) {
        setWarning(body.alertError);
      }
      router.refresh();
    } catch (cause) {
      console.error("Site check request failed", cause);
      setError("Не удалось выполнить проверку");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`${ghostButton} whitespace-nowrap`}
      >
        {pending ? "Проверяем…" : "Проверить сейчас"}
      </button>
      {error ? (
        <span className="px-3 text-xs text-red-600">{error}</span>
      ) : null}
      {warning ? (
        <span className="px-3 text-xs text-amber-600">{warning}</span>
      ) : null}
    </span>
  );
}
