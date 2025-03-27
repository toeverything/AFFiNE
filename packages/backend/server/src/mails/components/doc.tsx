import { Link } from '@react-email/components';

import { Bold } from './template';

export interface DocProps {
  title: string;
  url: string;
}

export const Doc = (props: DocProps) => {
  return (
    <Link href={props.url}>
      <Bold>{props.title || 'Untitled'}</Bold>
    </Link>
  );
};
