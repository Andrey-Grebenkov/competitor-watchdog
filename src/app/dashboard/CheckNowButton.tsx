"use client";

import { useState } from "react";
import { ActionError } from "@/components/ActionError";
import { ghostButton, inlineWarningText } from "@/lib/ui";
import { useApiAction } from "@/lib/useApiAction";

export function CheckNowButton({ siteId }: { siteId: string }) {
  const { error, busy, run } = useApiAction();
  const [warning, setWarning] = useState<string | null>(null);

  const handleClick = () => {
    setWarning(null);
    return run<{ ok?: boolean; error?: string; alertError?: string }>({
      url: `/api/sites/${siteId}/check`,
      init: { method: "POST" },
      fallbackError: "Не удалось выполнить проверку",
      onSuccess: (body) => setWarning(body?.alertError ?? null),
    });
  };

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
      {warning ? <span className={inlineWarningText}>{warning}</span> : null}
    </span>
  );
}
