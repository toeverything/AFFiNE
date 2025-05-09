import { Name } from './template';

export interface UserProps {
  email: string;
}

export const User = (props: UserProps) => {
  return <Name>{props.email}</Name>;
};
