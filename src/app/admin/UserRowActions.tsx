"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ghostButton, ghostButtonDanger } from "@/lib/ui";

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
  const router = useRouter();
  const [pending, setPending] = useState<"toggle" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async (
    action: "toggle" | "delete",
    init: RequestInit,
    fallback: string,
  ) => {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? fallback);
        return;
      }
      router.refresh();
    } catch (cause) {
      console.error(`Admin user ${action} request failed`, cause);
      setError(fallback);
    } finally {
      setPending(null);
    }
  };

  const handleToggle = () =>
    request(
      "toggle",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUnlimited: !isUnlimited }),
      },
      "Не удалось изменить тариф",
    );

  const handleDelete = () => {
    if (
      !window.confirm(`Удалить аккаунт ${email} со всеми сайтами и проверками?`)
    ) {
      return;
    }
    return request(
      "delete",
      { method: "DELETE" },
      "Не удалось удалить аккаунт",
    );
  };

  return (
    <div className="flex flex-col items-start">
      <div className="flex flex-wrap items-start gap-1">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending !== null}
          className={`${ghostButton} whitespace-nowrap`}
        >
          {pending === "toggle"
            ? "Сохраняем…"
            : isUnlimited
              ? "Снять безлимит"
              : "Выдать безлимит (Pro)"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending !== null || isSelf}
          title={isSelf ? "Нельзя удалить свой аккаунт" : undefined}
          className={`${ghostButtonDanger} whitespace-nowrap`}
        >
          {pending === "delete" ? "Удаляем…" : "Удалить аккаунт"}
        </button>
      </div>
      {error ? (
        <span className="px-3 text-xs text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
