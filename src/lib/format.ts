const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}
