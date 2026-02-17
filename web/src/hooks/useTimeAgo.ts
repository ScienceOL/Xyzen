import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DATE_FNS_LOCALE_MAP } from "@/lib/formatDate";
import { enUS } from "date-fns/locale";

/**
 * Returns a reactive, i18n-aware relative time string (e.g. "6 minutes ago" / "6 分钟前").
 * Re-renders every 60 s so the label stays fresh.
 */
export function useTimeAgo(date: string | number | Date): string {
  const { i18n } = useTranslation();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const locale = useMemo(
    () => DATE_FNS_LOCALE_MAP[i18n.language] ?? enUS,
    [i18n.language],
  );

  return useMemo(() => {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return formatDistanceToNow(d, { addSuffix: true, locale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, locale, tick]);
}
