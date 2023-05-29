export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() == today.getDate() &&
    date.getMonth() == today.getMonth() &&
    date.getFullYear() == today.getFullYear()
  );
}

export function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

export function isLastWeek(date: Date): boolean {
  const today = new Date();
  const lastWeek = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 7
  );
  return date >= lastWeek && date < today;
}

export function isLastMonth(date: Date): boolean {
  const today = new Date();
  const lastMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate()
  );
  return date >= lastMonth && date < today;
}

export function isLastYear(date: Date): boolean {
  const today = new Date();
  const lastYear = new Date(
    today.getFullYear() - 1,
    today.getMonth(),
    today.getDate()
  );
  return date >= lastYear && date < today;
}

export const formatDate = (date: Date): string => {
  // yyyy-mm-dd MM-DD HH:mm
  // const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  if (isToday(date)) {
    // HH:mm
    return `${hours}:${minutes}`;
  }
  // MM-DD HH:mm
  return `${month}-${day} ${hours}:${minutes}`;
};
