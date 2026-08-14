import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/users";

const patchSchema = z
  .object({
    isUnlimited: z.boolean().optional(),
    subscriptionStatus: z.enum(["free", "premium"]).optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Нечего обновлять",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) {
    return response;
  }

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Некорректные данные", 400);
  }

  if (id === admin.id && parsed.data.role === "USER") {
    return jsonError("Нельзя снять с себя права администратора", 400);
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return jsonError("Пользователь не найден", 404);
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/admin");

  return Response.json({ user: serializeUser(user) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) {
    return response;
  }

  const { id } = await params;
  if (id === admin.id) {
    return jsonError("Нельзя удалить свой аккаунт", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) {
    return jsonError("Пользователь не найден", 404);
  }

  // Сайты, проверки, эталоны, сессии и аккаунты удаляются каскадом.
  await prisma.user.delete({ where: { id } });

  revalidatePath("/admin");
  return Response.json({ ok: true });
}
