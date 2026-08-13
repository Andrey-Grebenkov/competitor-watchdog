"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { card, errorText, ghostButton, input, mutedText } from "@/lib/ui";
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

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    action,
    {},
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const copy = COPY[mode];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-20">
      <div>
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className={`mt-1 ${mutedText}`}>Competitor Watchdog</p>
      </div>

      <form action={formAction} className={`flex flex-col gap-4 p-6 ${card}`}>
        {mode === "register" ? (
          <label className="flex flex-col gap-1 text-sm">
            Имя (опционально)
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className={input}
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
            className={input}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Пароль
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className={input}
          />
        </label>

        {state.error ? <p className={errorText}>{state.error}</p> : null}

        <SubmitButton label={copy.submit} pendingLabel={copy.pending} />
      </form>

      <p className={`flex flex-wrap items-center gap-1 ${mutedText}`}>
        {copy.hint}
        <Link href={copy.href} className={ghostButton}>
          {copy.linkText}
        </Link>
      </p>
    </main>
  );
}
