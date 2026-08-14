const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Строковое поле формы: всегда строка, по умолчанию обрезанная по краям. */
export function formString(
  formData: FormData,
  key: string,
  { fallback = "", trim = true }: { fallback?: string; trim?: boolean } = {},
): string {
  const value = String(formData.get(key) ?? fallback);
  return trim ? value.trim() : value;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}
