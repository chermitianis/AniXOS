// ============================================================================
// أنواع مشتركة لقسم Rapports — فترة زمنية موحّدة + أنواع مساعدة
// ============================================================================

export type PeriodPreset =
  | "week_current"
  | "month_current"
  | "year_current"
  | "last_7d"
  | "last_30d"
  | "last_365d"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: PeriodPreset;
}

export function computeDateRange(preset: PeriodPreset, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "week_current": {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: startOfDay(monday), to: endOfDay(sunday), preset };
    }
    case "month_current": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from, to, preset };
    }
    case "year_current": {
      const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { from, to, preset };
    }
    case "last_7d": {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now), preset };
    }
    case "last_30d": {
      const from = new Date(now);
      from.setDate(now.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now), preset };
    }
    case "last_365d": {
      const from = new Date(now);
      from.setDate(now.getDate() - 364);
      return { from: startOfDay(from), to: endOfDay(now), preset };
    }
    case "custom":
    default: {
      if (custom) return { from: startOfDay(custom.from), to: endOfDay(custom.to), preset: "custom" };
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from, to, preset: "month_current" };
    }
  }
}

export function toISO(d: Date): string {
  return d.toISOString();
}