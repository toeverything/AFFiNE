const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export const timestampToLocalTime = (ts: string) => {
  return timeFormatter.format(new Date(ts));
};

export const timestampToLocalDate = (ts: string) => {
  return dateFormatter.format(new Date(ts));
};
