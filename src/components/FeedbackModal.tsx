"use client";

import { useEffect } from "react";
import { FeedbackForm } from "@/app/dashboard/feedback/FeedbackForm";
import { ghostButton, mutedText } from "@/lib/ui";

interface FeedbackModalProps {
  userEmail: string;
  onClose: () => void;
}

export function FeedbackModal({ userEmail, onClose }: FeedbackModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-3 top-3 ${ghostButton}`}
          aria-label="Закрыть"
        >
          ✕
        </button>

        <div className="mb-4 pr-8">
          <h2 className="text-lg font-semibold">Обратная связь</h2>
          <p className={mutedText}>
            Расскажите о баге, предложите улучшение или просто поделитесь
            впечатлением.
          </p>
        </div>

        <FeedbackForm
          userEmail={userEmail}
          onCancel={onClose}
          showCard={false}
        />
      </div>
    </div>
  );
}
