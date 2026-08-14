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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6 pt-20 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Обратная связь</h2>
            <p className={mutedText}>
              Расскажите о баге, предложите улучшение или просто поделитесь
              впечатлением.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={ghostButton}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <FeedbackForm userEmail={userEmail} />
      </div>
    </div>
  );
}
