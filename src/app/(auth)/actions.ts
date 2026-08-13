"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export interface AuthFormState {
  error?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_PASSWORD_LENGTH = 200;

/** Окно попыток входа/регистрации — тормозит перебор паролей. */
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_REGISTRATIONS = 5;

function tooManyAttempts(action: string, email: string, limit: number): boolean {
  return !rateLimit({
    key: `${action}:${email}`,
    limit,
    windowMs: AUTH_WINDOW_MS,
  }).allowed;
}

export async function registerUser(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Укажите корректный email" };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов" };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      error: `Пароль не должен превышать ${MAX_PASSWORD_LENGTH} символов`,
    };
  }
  if (tooManyAttempts("register", email, MAX_REGISTRATIONS)) {
    return { error: "Слишком много попыток, попробуйте позже" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Пользователь с таким email уже зарегистрирован" };
  }

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash: await hash(password, 12),
    },
  });

  await signIn("credentials", { email, password, redirect: false });
  redirect("/dashboard");
}

export async function loginUser(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (tooManyAttempts("login", email, MAX_LOGIN_ATTEMPTS)) {
    return { error: "Слишком много попыток входа, попробуйте позже" };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Неверный email или пароль" };
    }
    throw error;
  }

  redirect("/dashboard");
}

export async function signOutUser(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
