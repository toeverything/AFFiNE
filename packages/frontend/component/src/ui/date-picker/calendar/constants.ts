import dayjs from 'dayjs';

export const DATE_MIN = '1900-01-01';
export const DATE_MAX = '2099-12-31';

export const YEAR_MIN = dayjs(DATE_MIN).year();
export const YEAR_MAX = dayjs(DATE_MAX).year();
