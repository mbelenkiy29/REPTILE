const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 864e5], ["month", 30 * 864e5], ["week", 7 * 864e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4],
];

/** "3 hours ago", "in 2 days", "just now". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = Date.parse(iso) - now;
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  return "just now";
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en", {
    month: "short", day: "numeric", year: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" } : { timeZone: "UTC" }),
  });
}

export const formatNumber = (n: number) => n.toLocaleString("en");

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

export function plural(n: number, one: string, many = one + "s") {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
