"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addSite, type AddSiteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
    >
      {pending ? "Добавляем…" : "Добавить сайт"}
    </button>
  );
}

export function AddSiteForm() {
  const [state, formAction] = useActionState<AddSiteState, FormData>(addSite, {});

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15"
    >
      <label className="flex flex-col gap-1 text-sm">
        Название
        <input
          name="name"
          required
          placeholder="Конкурент А"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        URL
        <input
          name="url"
          type="url"
          required
          placeholder="https://competitor.com/product"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        CSS-селектор (опционально)
        <input
          name="cssSelector"
          placeholder="div.current-price"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Интервал проверки, часов
        <input
          name="checkIntervalHours"
          type="number"
          min={1}
          defaultValue={24}
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton />
        {state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-green-600">Сайт добавлен</p>
        ) : null}
      </div>
    </form>
  );
}
