import { useAFFiNEI18N } from '@affine/i18n/hooks';

import type { DateKey, ListData } from './type';
import {
  isLastMonth,
  isLastWeek,
  isLastYear,
  isToday,
  isYesterday,
} from './utils';

export const useDateGroup = ({
  data,
  key,
}: {
  data: ListData[];
  key?: DateKey;
}) => {
  const t = useAFFiNEI18N();
  if (!key) {
    return data.map(item => ({ ...item, groupName: '' }));
  }

  const fallbackGroup = {
    id: 'earlier',
    label: t['com.affine.earlier'](),
    match: (_date: Date) => true,
  };

  const groups = [
    {
      id: 'today',
      label: t['com.affine.today'](),
      match: (date: Date) => isToday(date),
    },
    {
      id: 'yesterday',
      label: t['com.affine.yesterday'](),
      match: (date: Date) => isYesterday(date) && !isToday(date),
    },
    {
      id: 'last7Days',
      label: t['com.affine.last7Days'](),
      match: (date: Date) => isLastWeek(date) && !isYesterday(date),
    },
    {
      id: 'last30Days',
      label: t['com.affine.last30Days'](),
      match: (date: Date) => isLastMonth(date) && !isLastWeek(date),
    },
    {
      id: 'currentYear',
      label: t['com.affine.currentYear'](),
      match: (date: Date) => isLastYear(date) && !isLastMonth(date),
    },
  ] as const;

  return data.map(item => {
    const group = groups.find(group => group.match(item[key])) ?? fallbackGroup;
    return {
      ...item,
      groupName: group.label,
    };
  });
};
