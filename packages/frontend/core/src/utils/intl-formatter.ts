import dayjs from 'dayjs';

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export const timestampToLocalTime = (ts: string | number) => {
  return timeFormatter.format(dayjs(ts).toDate());
};

export const timestampToLocalDate = (ts: string | number) => {
  return dateFormatter.format(dayjs(ts).toDate());
};
