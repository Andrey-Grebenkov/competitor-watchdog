"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  MAX_FEEDBACK_LENGTH,
} from "@/lib/feedback";
import { submitFeedback, type FeedbackFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
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
      <div className="rounded-lg border border-green-600/30 bg-green-50 p-6 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
        Спасибо за ваш отзыв!
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/15"
    >
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
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
      )}

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1">Тип отзыва</legend>
        <div className="flex flex-wrap gap-4">
          {FEEDBACK_TYPES.map((type, index) => (
            <label key={type} className="flex items-center gap-2">
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
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <SubmitButton />
    </form>
  );
}
