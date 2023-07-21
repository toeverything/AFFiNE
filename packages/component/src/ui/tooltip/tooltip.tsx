import { NoSsr } from '@mui/material';
import type { ReactElement } from 'react';

import { styled } from '../../styles';
import { Popper, type PopperProps } from '../popper';
import StyledPopperContainer from '../shared/container';

const StyledTooltip = styled(StyledPopperContainer)(() => {
  return {
    maxWidth: '320px',
    boxShadow: 'var(--affine-float-button-shadow)',
    padding: '4px 12px',
    backgroundColor: 'var(--affine-tooltip)',
    color: 'var(--affine-white)',
    fontSize: 'var(--affine-font-sm)',
    borderRadius: '8px',
    marginBottom: '12px',
    overflowWrap: 'break-word',
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
