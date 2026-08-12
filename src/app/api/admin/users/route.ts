import { requireAdmin } from "@/lib/admin";
import { planLabel, planNameFor } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

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
      id: user.id,
      email: user.email,
      role: user.role,
      isUnlimited: user.isUnlimited,
      subscriptionStatus: user.subscriptionStatus,
      plan: planLabel(planNameFor(user)),
      sitesCount: user._count.sites,
      createdAt: user.createdAt.toISOString(),
    })),
  });
}
