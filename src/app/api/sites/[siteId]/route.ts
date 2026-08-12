import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
    select: { id: true },
  });
  if (!site) {
    return Response.json({ error: "Сайт не найден" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.checkHistory.deleteMany({ where: { siteId: site.id } }),
    prisma.watchedSite.delete({ where: { id: site.id } }),
  ]);

  revalidatePath("/dashboard");
  return Response.json({ ok: true });
}
