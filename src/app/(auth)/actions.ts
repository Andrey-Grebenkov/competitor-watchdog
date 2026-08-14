"use server";

import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { formString, isValidEmail, normalizeEmail } from "@/lib/input";
import { prisma } from "@/lib/prisma";

export interface AuthFormState {
  error?: string;
}

/** Гонка двух регистраций на один email — уникальный индекс в БД. */
function isEmailTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function registerUser(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = formString(formData, "password", { trim: false });
  const name = formString(formData, "name");

  if (!isValidEmail(email)) {
    return { error: "Укажите корректный email" };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Пользователь с таким email уже зарегистрирован" };
  }

  try {
    await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash: await hash(password, 12),
      },
    });
  } catch (error) {
    if (isEmailTaken(error)) {
      return { error: "Пользователь с таким email уже зарегистрирован" };
    }
    console.error("Register Error Details:", error);
    return { error: "Не удалось создать аккаунт, попробуйте ещё раз" };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    console.error("Register Sign-in Error Details:", error);
    return {
      error: "Аккаунт создан, но войти не удалось — войдите со страницы входа",
    };
  }

  redirect("/dashboard");
}

export async function loginUser(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = formString(formData, "password", { trim: false });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // Неверные данные — ожидаемый случай, но причина нужна в логах:
      // так же выглядит сбой конфига Auth.js или недоступная БД.
      // Полный AuthError не логируется: его cause может содержать креды.
      console.error("Login Error Details:", error.type, error.message);
      return { error: "Неверный email или пароль" };
    }
    throw error;
  }

  redirect("/dashboard");
}

export async function signOutUser(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
