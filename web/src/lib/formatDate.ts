import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, ja, zhCN } from "date-fns/locale";
import i18n from "i18next";

/** Shared mapping from i18n language code → date-fns Locale. */
export const DATE_FNS_LOCALE_MAP: Record<string, Locale> = {
  zh: zhCN,
  ja: ja,
  en: enUS,
};

/** Resolve the current date-fns locale from the active i18n language. */
export function getDateFnsLocale(): Locale {
  return DATE_FNS_LOCALE_MAP[i18n.language] ?? enUS;
}

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const locale = getDateFnsLocale();

  // Within 24 hours — relative time, e.g. "5 hours ago" / "约5小时前"
  if (now.getTime() - date.getTime() < 24 * 60 * 60 * 1000) {
    return formatDistanceToNow(date, { addSuffix: true, locale });
  }

  // Yesterday
  if (isYesterday(date)) {
    const yesterday =
      locale === zhCN ? "昨天" : locale === ja ? "昨日" : "Yesterday";
    return `${yesterday} ${format(date, "HH:mm")}`;
  }

  // Today (safety fallback)
  if (isToday(date)) {
    return format(date, "HH:mm");
  }

  // Older
  return format(date, "yyyy-MM-dd");
}
