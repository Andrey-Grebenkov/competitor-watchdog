"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOutUser } from "@/app/(auth)/actions";
import { FeedbackModal } from "@/components/FeedbackModal";
import {
  ghostButton,
  ghostButtonDanger,
  mutedText,
  subtleText,
} from "@/lib/ui";
import { getUserInitials } from "@/lib/users";

type HeaderUser = {
  email: string;
  name: string | null;
  image: string | null;
  role: "USER" | "ADMIN";
  plan: string;
};

interface UserDropdownProps {
  user: HeaderUser;
  sitesLabel: string;
}

export function UserDropdown({ user, sitesLabel }: UserDropdownProps) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setFeedbackOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = getUserInitials(user.name, user.email);
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full p-1 pr-3 text-foreground transition hover:bg-black/5 dark:hover:bg-white/10"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="size-9 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
            {initials}
          </span>
        )}
        <span
          className={`hidden max-w-[160px] truncate text-sm sm:block ${mutedText}`}
        >
          {user.name || user.email}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-black/10 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-slate-900"
          role="menu"
        >
          <div className="flex items-start gap-3 p-3">
            {user.image ? (
              <Image
                src={user.image}
                alt=""
                width={40}
                height={40}
                unoptimized
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user.name || user.email}
              </p>
              <p className={`truncate text-xs ${subtleText}`}>{user.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300">
                  {user.plan}
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20 dark:bg-purple-950/40 dark:text-purple-300">
                    Админ
                  </span>
                )}
              </div>
              <p className={`mt-1.5 text-xs ${subtleText}`}>
                Сайты: {sitesLabel}
              </p>
            </div>
          </div>

          <div className="my-1 h-px bg-black/10 dark:bg-white/10" />

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ghostButton}`}
          >
            Главная
          </Link>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ghostButton}`}
          >
            Отслеживаемые сайты
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ghostButton}`}
            >
              Админ-панель
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setFeedbackOpen(true);
            }}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ghostButton}`}
          >
            Обратная связь
          </button>

          <div className="my-1 h-px bg-black/10 dark:bg-white/10" />

          <form action={signOutUser} className="w-full">
            <button
              type="submit"
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${ghostButtonDanger}`}
            >
              Выйти
            </button>
          </form>
        </div>
      )}

      {feedbackOpen && (
        <FeedbackModal
          userEmail={user.email}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </div>
  );
}
