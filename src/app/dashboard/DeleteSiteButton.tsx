"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ghostButtonDanger } from "@/lib/ui";

export function DeleteSiteButton({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!window.confirm(`Удалить «${siteName}» и всю историю проверок?`)) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Не удалось удалить сайт");
        return;
      }
      router.refresh();
    } catch (cause) {
      console.error("Site delete request failed", cause);
      setError("Не удалось удалить сайт");
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
        className={`${ghostButtonDanger} whitespace-nowrap`}
      >
        {pending ? "Удаляем…" : "Удалить"}
      </button>
      {error ? (
        <span className="px-3 text-xs text-red-600">{error}</span>
      ) : null}
    </span>
  );
}
