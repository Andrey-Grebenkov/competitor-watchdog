"use server";

import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { formString, isValidEmail, normalizeEmail } from "@/lib/input";
import { prisma } from "@/lib/prisma";

export interface AuthFormState {
  error?: string;
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
  const email = normalizeEmail(formData.get("email"));
  const password = formString(formData, "password", { trim: false });

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
