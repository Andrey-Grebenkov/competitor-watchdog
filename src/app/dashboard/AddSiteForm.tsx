"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { card, errorText, input } from "@/lib/ui";
import { addSite, type AddSiteState } from "./actions";

export function AddSiteForm() {
  const [state, formAction] = useActionState<AddSiteState, FormData>(
    addSite,
    {},
  );
  const values = state.values;

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
          defaultValue={values?.name ?? ""}
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
          defaultValue={values?.url ?? ""}
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        CSS-селектор (опционально)
        <input
          name="cssSelector"
          placeholder="div.current-price"
          defaultValue={values?.cssSelector ?? ""}
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Интервал проверки, часов
        <input
          name="checkIntervalHours"
          type="number"
          min={1}
          defaultValue={values?.checkIntervalHours ?? "24"}
          className={input}
        />
      </label>

      <div className="sm:col-span-2">
        <SubmitButton label="Добавить сайт" pendingLabel="Добавляем…" />
        {state.error ? (
          <p className={`mt-3 ${errorText}`}>{state.error}</p>
        ) : null}
        {state.notice ? (
          <p className="mt-3 text-sm text-amber-600">{state.notice}</p>
        ) : null}
        {state.success && !state.notice ? (
          <p className="mt-3 text-sm text-green-600">Сайт добавлен</p>
        ) : null}
      </div>
    </form>
  );
}
