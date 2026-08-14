import { inlineErrorText } from "@/lib/ui";

/** Текст ошибки рядом с кнопкой действия. */
export function ActionError({ message }: { message: string | null }) {
  return message ? <span className={inlineErrorText}>{message}</span> : null;
}
