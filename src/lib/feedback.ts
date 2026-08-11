export const FEEDBACK_TYPES = ["bug", "feature", "general"] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Баг",
  feature: "Предложение",
  general: "Общий отзыв",
};

export const MAX_FEEDBACK_LENGTH = 2000;

export function isFeedbackType(value: string): value is FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(value);
}
