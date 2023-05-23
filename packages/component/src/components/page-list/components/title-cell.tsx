import type { TableCellProps } from '@affine/component';
import { Content, TableCell } from '@affine/component';

import { StyledTitleLink } from '../styles';

export const TitleCell = ({
  icon,
  text,
  suffix,
  ...props
}: {
  icon: JSX.Element;
  text: string;
  suffix?: JSX.Element;
} & TableCellProps) => {
  return (
    <TableCell {...props}>
      <StyledTitleLink>
        {icon}
        <Content ellipsis={true} color="inherit">
          {text}
        </Content>
      </StyledTitleLink>
      {suffix}
    </TableCell>
  );
};
