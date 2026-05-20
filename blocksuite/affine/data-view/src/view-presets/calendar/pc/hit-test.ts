export const getCalendarDateFromPoint = (
  root: HTMLElement,
  clientX: number,
  clientY: number
) => {
  const doc = root.ownerDocument;
  const hitStack = doc.elementsFromPoint(clientX, clientY);

  for (const element of hitStack) {
    const day = element.closest<HTMLElement>('.calendar-day[data-date]');
    if (day && root.contains(day)) {
      return Number(day.dataset['date']);
    }
  }

  for (const element of hitStack) {
    const week =
      element.closest<HTMLElement>('.calendar-week') ??
      element.closest<HTMLElement>('.calendar-segments')?.parentElement;
    if (week && root.contains(week)) {
      const days = week.querySelectorAll<HTMLElement>('.calendar-day');
      for (const day of days) {
        const rect = day.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX < rect.right &&
          clientY >= rect.top &&
          clientY < rect.bottom &&
          day.dataset['date']
        ) {
          return Number(day.dataset['date']);
        }
      }
    }
  }

  return;
};
