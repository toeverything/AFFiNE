import { Bold } from './template';

export interface DateProps {
  value: Date;
}

export const IOSDate = (props: DateProps) => {
  const year = String(props.value.getFullYear()).padStart(4, '0');
  const month = String(props.value.getMonth() + 1).padStart(2, '0');
  const day = String(props.value.getDate()).padStart(2, '0');

  return <Bold>{`${year}-${month}-${day}`}</Bold>;
};
