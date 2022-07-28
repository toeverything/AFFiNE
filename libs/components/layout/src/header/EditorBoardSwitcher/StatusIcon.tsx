import { styled } from '@toeverything/components/ui';
import { DocViewIcon, BoardViewIcon } from '@toeverything/components/icons';
import { DocMode } from './type';

interface StatusIconProps {
    mode: DocMode;
}

export const StatusIcon = ({ mode }: StatusIconProps) => {
    return (
        <IconWrapper mode={mode}>
            {mode === DocMode.doc ? <DocViewIcon /> : <BoardViewIcon />}
        </IconWrapper>
    );
};

const IconWrapper = styled('div')<Pick<StatusIconProps, 'mode'>>(
    ({ theme, mode }) => {
        return {
            width: '20px',
            height: '20px',
            borderRadius: '5px',
            boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
            color: theme.affine.palette.primary,
            cursor: 'pointer',
            backgroundColor: theme.affine.palette.white,
            transform: `translateX(${mode === DocMode.doc ? 0 : 20}px)`,
            transition: 'transform 300ms ease',

            '& > svg': {
                fontSize: '20px',
            },
        };
    }
);
