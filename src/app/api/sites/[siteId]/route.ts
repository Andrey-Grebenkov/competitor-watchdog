import { revalidatePath } from "next/cache";
import { jsonError, requireUser } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { user, response } = await requireUser();
  if (response) {
    return response;
  }

  const { siteId } = await params;
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
    select: { id: true },
  });
  if (!site) {
    return jsonError("Сайт не найден", 404);
  }

  await prisma.$transaction([
    prisma.checkHistory.deleteMany({ where: { siteId: site.id } }),
    prisma.watchedSite.delete({ where: { id: site.id } }),
  ]);

  revalidatePath("/dashboard");
  return Response.json({ ok: true });
}
