import type { CSSProperties, ReactNode } from 'react';
import type { MuiDividerProps } from '../mui';
import { MuiDivider } from '../mui';
import { styled } from '../styled';

interface DividerProps {
    orientation?: 'horizontal' | 'vertical';
    textAlign?: 'center' | 'start' | 'end';
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
}

const _textAlignMap: Record<
    DividerProps['textAlign'],
    MuiDividerProps['textAlign']
> = {
    center: 'center',
    start: 'left',
    end: 'right',
};

export const Divider = ({
    orientation = 'horizontal',
    textAlign = 'center',
    children,
}: DividerProps) => {
    return (
        <StyledMuiDivider
            orientation={orientation}
            textAlign={_textAlignMap[textAlign]}
            variant="fullWidth"
        >
            {children}
        </StyledMuiDivider>
    );
};

const StyledMuiDivider = styled(MuiDivider)<Pick<DividerProps, 'orientation'>>(
    ({ orientation }) => {
        if (orientation === 'horizontal') {
            return {
                marginTop: '6px',
                marginBottom: '6px',
            };
        }
        return {
            marginLeft: '6px',
            marginRight: '6px',
        };
    }
);
