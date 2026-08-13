"use client";

import { ActionError } from "@/components/ActionError";
import { ghostButtonDanger } from "@/lib/ui";
import { useApiAction } from "@/lib/useApiAction";

export function DeleteSiteButton({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const { error, busy, run } = useApiAction();

  const handleClick = () => {
    if (!window.confirm(`Удалить «${siteName}» и всю историю проверок?`)) {
      return;
    }
    return run({
      url: `/api/sites/${siteId}`,
      init: { method: "DELETE" },
      fallbackError: "Не удалось удалить сайт",
    });
  };

  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`${ghostButtonDanger} whitespace-nowrap`}
      >
        {busy ? "Удаляем…" : "Удалить"}
      </button>
      <ActionError message={error} />
    </span>
  );
}
