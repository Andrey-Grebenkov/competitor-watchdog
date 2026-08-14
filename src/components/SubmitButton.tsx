"use client";

import { useFormStatus } from "react-dom";
import { primaryButton } from "@/lib/ui";

/** Кнопка отправки формы со спиннером на время серверного экшена. */
export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className ? `${className} ${primaryButton}` : primaryButton}
    >
      {pending ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
