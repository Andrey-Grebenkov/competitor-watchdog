"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { card, input, primaryButton } from "@/lib/ui";
import { addSite, type AddSiteState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButton}>
      {pending ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : null}
      {pending ? "Добавляем…" : "Добавить сайт"}
    </button>
  );
}

export function AddSiteForm() {
  const [state, formAction] = useActionState<AddSiteState, FormData>(
    addSite,
    {},
  );

  return (
    <form
      action={formAction}
      className={`grid gap-4 p-5 sm:grid-cols-2 ${card}`}
    >
      <label className="flex flex-col gap-1 text-sm">
        Название
        <input
          name="name"
          required
          placeholder="Конкурент А"
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        URL
        <input
          name="url"
          type="url"
          required
          placeholder="https://competitor.com/product"
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        CSS-селектор (опционально)
        <input
          name="cssSelector"
          placeholder="div.current-price"
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Интервал проверки, часов
        <input
          name="checkIntervalHours"
          type="number"
          min={1}
          defaultValue={24}
          className={input}
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
