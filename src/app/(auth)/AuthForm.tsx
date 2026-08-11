"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthFormState } from "./actions";

type AuthAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

interface AuthFormProps {
  mode: "login" | "register";
  action: AuthAction;
}

const COPY = {
  login: {
    title: "Вход",
    submit: "Войти",
    pending: "Входим…",
    hint: "Нет аккаунта?",
    linkText: "Зарегистрироваться",
    href: "/register",
  },
  register: {
    title: "Регистрация",
    submit: "Создать аккаунт",
    pending: "Создаём…",
    hint: "Уже есть аккаунт?",
    linkText: "Войти",
    href: "/login",
  },
} as const;

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const copy = COPY[mode];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <div>
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Competitor Watchdog
        </p>
      </div>

      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/15"
      >
        {mode === "register" ? (
          <label className="flex flex-col gap-1 text-sm">
            Имя (опционально)
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Пароль
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        {state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}

        <SubmitButton label={copy.submit} pendingLabel={copy.pending} />
      </form>

      <p className="text-sm text-black/60 dark:text-white/60">
        {copy.hint}{" "}
        <Link href={copy.href} className="underline underline-offset-4">
          {copy.linkText}
        </Link>
      </p>
    </main>
  );
}
