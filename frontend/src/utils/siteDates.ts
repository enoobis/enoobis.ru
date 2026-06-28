const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export function formatSiteDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(`${iso}T12:00:00`) : iso;
  const day = d.getDate();
  const month = MONTHS[d.getMonth()] ?? "";
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** first day of the current month — rolls over automatically each month */
export function lastBackupDateLabel(): string {
  const now = new Date();
  return formatSiteDate(new Date(now.getFullYear(), now.getMonth(), 1));
}
