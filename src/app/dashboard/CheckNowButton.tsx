"use client";

import { ActionError } from "@/components/ActionError";
import { ghostButton } from "@/lib/ui";
import { useApiAction } from "@/lib/useApiAction";

export function CheckNowButton({ siteId }: { siteId: string }) {
  const { error, busy, run } = useApiAction();

  const handleClick = () =>
    run({
      url: `/api/sites/${siteId}/check`,
      init: { method: "POST" },
      fallbackError: "Не удалось выполнить проверку",
    });

  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`${ghostButton} whitespace-nowrap`}
      >
        {busy ? "Проверяем…" : "Проверить сейчас"}
      </button>
      <ActionError message={error} />
    </span>
  );
}
