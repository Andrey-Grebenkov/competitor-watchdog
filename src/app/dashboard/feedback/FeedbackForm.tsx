"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  MAX_FEEDBACK_LENGTH,
} from "@/lib/feedback";
import { card, input, primaryButton } from "@/lib/ui";
import { submitFeedback, type FeedbackFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`self-start ${primaryButton}`}
    >
      {pending ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : null}
      {pending ? "Отправляем…" : "Отправить"}
    </button>
  );
}

export function FeedbackForm({ userEmail }: { userEmail: string | null }) {
  const [state, formAction] = useActionState<FeedbackFormState, FormData>(
    submitFeedback,
    {},
  );

  if (state.success) {
    return (
      <div className="rounded-xl border border-green-600/30 bg-green-50 p-6 text-sm text-green-800 shadow-sm dark:bg-green-950/30 dark:text-green-300">
        Спасибо за ваш отзыв!
      </div>
    );
  }

  return (
    <form action={formAction} className={`flex flex-col gap-4 p-6 ${card}`}>
      {userEmail ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          Отзыв будет отправлен от {userEmail}
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          Email для связи
          <input
            name="userEmail"
            type="email"
            required
            autoComplete="email"
            className={input}
          />
        </label>
      )}

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1">Тип отзыва</legend>
        <div className="flex flex-wrap gap-4">
          {FEEDBACK_TYPES.map((type, index) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 px-3 py-1.5 transition hover:bg-slate-100 dark:border-white/15 dark:hover:bg-slate-800"
            >
              <input
                type="radio"
                name="type"
                value={type}
                defaultChecked={index === 0}
                required
              />
              {FEEDBACK_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Сообщение
        <textarea
          name="message"
          required
          rows={6}
          minLength={5}
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder="Что сломалось, чего не хватает или что понравилось?"
          className={input}
        />
      </label>

      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
