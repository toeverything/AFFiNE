const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() == today.getDate() &&
    date.getMonth() == today.getMonth() &&
    date.getFullYear() == today.getFullYear()
  );
};

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
