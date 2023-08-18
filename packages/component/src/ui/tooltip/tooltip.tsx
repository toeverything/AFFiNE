import { NoSsr } from '@mui/material';
import type { ReactElement } from 'react';

import { styled } from '../../styles';
import { Popper, type PopperProps } from '../popper';
import StyledPopperContainer from '../shared/container';

const StyledTooltip = styled(StyledPopperContainer)(() => {
  return {
    display: 'inline-flex',
    minHeight: '38px',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: 'var(--affine-tooltip)',
    borderRadius: '4px',
    color: 'var(--affine-white)',
    padding: '5px 12px',
  };
});

interface TooltipProps {
  content: string | ReactElement<any, any>;
  placement?: PopperProps['placement'];
  children: ReactElement<any, any>;
}
export const Tooltip = (props: PopperProps & Omit<TooltipProps, 'title'>) => {
  const { content, placement = 'top-start', children } = props;
  return (
    <NoSsr>
      <Popper
        {...props}
        content={<StyledTooltip placement={placement}>{content}</StyledTooltip>}
      >
        {children}
      </Popper>
    </NoSsr>
  );
};
