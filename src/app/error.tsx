"use client";

import { useEffect } from "react";
import { card, primaryButton } from "@/lib/ui";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled UI Error Details:", error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <div className={`flex flex-col gap-3 p-6 ${card}`}>
        <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {error.message || "Неизвестная ошибка"}
          {error.digest ? ` (код ${error.digest})` : null}
        </p>
        <button type="button" onClick={() => retry()} className={primaryButton}>
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
