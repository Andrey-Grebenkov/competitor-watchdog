import Link from "next/link";
import { UserDropdown } from "@/components/UserDropdown";
import { getCurrentUser } from "@/lib/currentUser";
import { planLabel } from "@/lib/plans";
import { getUserQuota, sitesQuotaLabel } from "@/lib/quota";
import { ghostButton, mutedText } from "@/lib/ui";

export default async function Header() {
  const user = await getCurrentUser();
  const quota = user ? await getUserQuota(user) : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/10 bg-background/95 backdrop-blur dark:border-white/15">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-foreground no-underline transition hover:opacity-80"
          >
            Competitor Watchdog
          </Link>
          <Link
            href="/dashboard"
            className={`${ghostButton} hidden sm:inline-flex`}
          >
            Отслеживаемые сайты
          </Link>
        </div>

        {user && quota ? (
          <div className="flex items-center gap-3 sm:gap-4">
            <span
              className={`hidden text-sm sm:inline ${mutedText}`}
              title="Тариф и лимит сайтов"
            >
              Тариф {planLabel(quota.planName)} · Сайты:{" "}
              {sitesQuotaLabel(quota)}
            </span>
            <UserDropdown
              user={{
                email: user.email,
                name: user.name,
                image: user.image,
                role: user.role,
                plan: planLabel(quota.planName),
              }}
              sitesLabel={sitesQuotaLabel(quota)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Link href="/login" className={ghostButton}>
              Войти
            </Link>
            <Link
              href="/register"
              className={`${ghostButton} hidden sm:inline-flex`}
            >
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
