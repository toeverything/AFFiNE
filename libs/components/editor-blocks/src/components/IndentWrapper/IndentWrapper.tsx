import { FC, PropsWithChildren } from 'react';
import { ChildrenView } from '@toeverything/framework/virgo';
import { styled } from '@toeverything/components/ui';

/**
 * Indent rendering child nodes
 */
export const IndentWrapper: FC<PropsWithChildren> = props => {
    return <StyledIdentWrapper>{props.children}</StyledIdentWrapper>;
};

const StyledIdentWrapper = styled('div')({
    display: 'flex',
    flexDirection: 'column',
    // TODO: marginLeft should use theme provided by styled
    marginLeft: '30px',
});
