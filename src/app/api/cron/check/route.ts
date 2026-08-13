import { jsonError } from "@/lib/apiAuth";
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
    return jsonError("Unauthorized", 401);
  }

  try {
    const run = await runCheckWorker();
    return Response.json(run);
  } catch (error) {
    return jsonError(errorMessage(error), 500);
  }
}
