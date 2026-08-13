"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RunOptions {
  url: string;
  init?: RequestInit;
  /** Сообщение, если сервер не прислал собственный текст ошибки. */
  fallbackError: string;
  /** Ключ для нескольких действий в одном компоненте. */
  key?: string;
}

const DEFAULT_KEY = "default";

/**
 * Вызов JSON-API из клиентского компонента: держит состояние загрузки и текст
 * ошибки, обновляет серверные данные страницы после успеха.
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async ({
    url,
    init,
    fallbackError,
    key = DEFAULT_KEY,
  }: RunOptions): Promise<void> => {
    setPending(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || body?.ok === false) {
        setError(body?.error ?? fallbackError);
        return;
      }
      router.refresh();
    } catch {
      setError(fallbackError);
    } finally {
      setPending(null);
    }
  };

  return {
    error,
    /** Идёт ли любое действие: блокирует все кнопки компонента. */
    busy: pending !== null,
    isPending: (key: string = DEFAULT_KEY) => pending === key,
    run,
  };
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
