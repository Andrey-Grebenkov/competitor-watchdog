import { runCheckWorker } from "@/lib/checkWorker";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
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
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
