"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ghostButton } from "@/lib/ui";

export function CheckNowButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/check`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setError(body?.error ?? "Не удалось выполнить проверку");
        return;
      }
      router.refresh();
    } catch {
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
    </span>
  );
}
