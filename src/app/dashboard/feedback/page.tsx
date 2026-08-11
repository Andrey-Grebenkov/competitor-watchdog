import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { ghostButton } from "@/lib/ui";
import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Обратная связь</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Расскажите о баге, предложите улучшение или просто поделитесь
            впечатлением.
          </p>
        </div>
        <Link href={user ? "/dashboard" : "/"} className={ghostButton}>
          {user ? "К списку сайтов" : "На главную"}
        </Link>
      </header>

      <FeedbackForm userEmail={user?.email ?? null} />
    </main>
  );
}
