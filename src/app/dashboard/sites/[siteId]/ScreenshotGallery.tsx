"use client";

import { useState } from "react";
import { ghostButton, subtleText } from "@/lib/ui";

export interface ScreenshotItem {
  src: string;
  label: string;
}

export function ScreenshotGallery({ items }: { items: ScreenshotItem[] }) {
  const [active, setActive] = useState<ScreenshotItem | null>(null);

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3">
        {items.map((item) => (
          <figure key={item.src} className="m-0 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setActive(item)}
              className="block overflow-hidden rounded-lg border border-black/10 bg-white p-0 transition hover:shadow-md dark:border-white/15 dark:bg-white/5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.label}
                loading="lazy"
                className="h-32 w-52 object-cover object-top"
              />
            </button>
            <figcaption className={subtleText}>{item.label}</figcaption>
          </figure>
        ))}
      </div>

      {active ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={active.label}
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-lg dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2 dark:border-white/15">
              <span className="text-sm font-medium">{active.label}</span>
              <button
                type="button"
                onClick={() => setActive(null)}
                className={ghostButton}
              >
                Закрыть
              </button>
            </div>
            <div className="overflow-auto p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.src}
                alt={active.label}
                className="mx-auto block h-auto max-w-full"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
