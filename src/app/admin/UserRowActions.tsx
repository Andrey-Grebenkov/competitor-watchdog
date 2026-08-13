"use client";

import { ActionError } from "@/components/ActionError";
import { ghostButton, ghostButtonDanger } from "@/lib/ui";
import { jsonRequest, useApiAction } from "@/lib/useApiAction";

export function UserRowActions({
  userId,
  email,
  isUnlimited,
  isSelf,
}: {
  userId: string;
  email: string;
  isUnlimited: boolean;
  isSelf: boolean;
}) {
  const { error, busy, isPending, run } = useApiAction();
  const url = `/api/admin/users/${userId}`;

  const handleToggle = () =>
    run({
      key: "toggle",
      url,
      init: jsonRequest("PATCH", { isUnlimited: !isUnlimited }),
      fallbackError: "Не удалось изменить тариф",
    });

  const handleDelete = () => {
    if (
      !window.confirm(`Удалить аккаунт ${email} со всеми сайтами и проверками?`)
    ) {
      return;
    }
    return run({
      key: "delete",
      url,
      init: { method: "DELETE" },
      fallbackError: "Не удалось удалить аккаунт",
    });
  };

  return (
    <div className="flex flex-col items-start">
      <div className="flex flex-wrap items-start gap-1">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          className={`${ghostButton} whitespace-nowrap`}
        >
          {isPending("toggle")
            ? "Сохраняем…"
            : isUnlimited
              ? "Снять безлимит"
              : "Выдать безлимит (Pro)"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy || isSelf}
          title={isSelf ? "Нельзя удалить свой аккаунт" : undefined}
          className={`${ghostButtonDanger} whitespace-nowrap`}
        >
          {isPending("delete") ? "Удаляем…" : "Удалить аккаунт"}
        </button>
      </div>
      <ActionError message={error} />
    </div>
  );
}
