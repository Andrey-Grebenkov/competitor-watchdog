"use server";

import { getCurrentUser } from "@/lib/currentUser";
import {
  FEEDBACK_TYPE_LABELS,
  MAX_FEEDBACK_LENGTH,
  isFeedbackType,
} from "@/lib/feedback";
import { formString, isValidEmail, normalizeEmail } from "@/lib/input";
import { prisma } from "@/lib/prisma";
import {
  escapeHtml,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";

export interface FeedbackFormState {
  error?: string;
  success?: boolean;
}

export async function submitFeedback(
  _prevState: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const type = formString(formData, "type", { trim: false });
  const message = formString(formData, "message");

  if (!isFeedbackType(type)) {
    return { error: "Выберите тип отзыва" };
  }
  if (message.length < 5) {
    return { error: "Сообщение должно быть не короче 5 символов" };
  }
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return {
      error: `Сообщение не должно превышать ${MAX_FEEDBACK_LENGTH} символов`,
    };
  }

  const user = await getCurrentUser();
  const userEmail = normalizeEmail(user?.email ?? formData.get("userEmail"));

  if (!isValidEmail(userEmail)) {
    return { error: "Укажите корректный email для связи" };
  }

  await prisma.feedback.create({
    data: { userId: user?.id ?? null, userEmail, type, message },
  });

  const adminChatId = process.env.TELEGRAM_CHAT_ID;
  if (adminChatId && isTelegramConfigured()) {
    try {
      await sendTelegramMessage({
        chatId: adminChatId,
        text: `💬 Новый отзыв [${escapeHtml(FEEDBACK_TYPE_LABELS[type])}] от ${escapeHtml(userEmail)}: ${escapeHtml(message)}`,
      });
    } catch (error) {
      console.error("Failed to notify admin about feedback", error);
    }
  }

  return { success: true };
}
