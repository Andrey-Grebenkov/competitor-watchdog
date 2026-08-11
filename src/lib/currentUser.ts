import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser(): Promise<User | null> {
  const email = process.env.DEMO_USER_EMAIL;
  if (email) {
    return prisma.user.findUnique({ where: { email } });
  }
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}
