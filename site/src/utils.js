export function formatKoreanDate(date = new Date(), timezone = "Asia/Seoul") {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatKoreanDateTime(isoString, timezone = "Asia/Seoul") {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

export function formatYearMonth(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(date);
}

export function getDateKey(date = new Date(), timezone = "Asia/Seoul") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function getWorkDate(timezone = "Asia/Seoul") {
  return getDateKey(new Date(), timezone);
}

export function getHourInTimeZone(timezone = "Asia/Seoul", date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}

export function getTimePartsInTimeZone(timezone = "Asia/Seoul", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

export function createId(prefix = "id") {
  const value = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${value}`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function buildCalendarDays(date) {
  const firstDay = startOfMonth(date);
  const firstWeekday = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    return {
      key: `${yyyy}-${mm}-${dd}`,
      date: current,
      day: current.getDate(),
      inMonth: current.getMonth() === date.getMonth(),
    };
  });
}
