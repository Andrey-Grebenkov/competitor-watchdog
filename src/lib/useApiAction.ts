"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ResponseBody {
  ok?: boolean;
  error?: string;
}

interface RunOptions<Body extends ResponseBody> {
  url: string;
  init?: RequestInit;
  /** Сообщение, если сервер не прислал собственный текст ошибки. */
  fallbackError: string;
  /** Ключ для нескольких действий в одном компоненте. */
  key?: string;
  /** Разбор успешного ответа до обновления страницы. */
  onSuccess?: (body: Body | null) => void;
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

  const run = async <Body extends ResponseBody = ResponseBody>({
    url,
    init,
    fallbackError,
    key = DEFAULT_KEY,
    onSuccess,
  }: RunOptions<Body>): Promise<void> => {
    setPending(key);
    setError(null);
    try {
      const response = await fetch(url, init);
      const body = (await response.json().catch(() => null)) as Body | null;
      if (!response.ok || body?.ok === false) {
        setError(body?.error ?? fallbackError);
        return;
      }
      onSuccess?.(body);
      router.refresh();
    } catch (cause) {
      console.error(`API action failed: ${init?.method ?? "GET"} ${url}`, cause);
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
