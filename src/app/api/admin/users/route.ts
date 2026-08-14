import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { serializeUser } from "@/lib/users";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) {
    return response;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { sites: true } } },
  });

  return Response.json({
    users: users.map((user) => ({
      ...serializeUser(user),
      sitesCount: user._count.sites,
      createdAt: user.createdAt.toISOString(),
    })),
  });
}
