import { timingSafeEqual } from "node:crypto";
import { runCheckWorker } from "@/lib/checkWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Без `CRON_SECRET` эндпоинт закрыт в любом окружении. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  return isEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await runCheckWorker();
    return Response.json(run);
  } catch (error) {
    console.error("Cron Worker Error Details:", error);
    return Response.json({ error: "Запуск не удался" }, { status: 500 });
  }
}
