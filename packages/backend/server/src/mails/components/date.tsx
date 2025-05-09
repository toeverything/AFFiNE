import { format } from 'date-fns';

import { Bold } from './template';

export interface DateProps {
  value: Date;
}

export const IOSDate = (props: DateProps) => {
  return <Bold>{format(props.value, 'yyyy-MM-dd')}</Bold>;
};
