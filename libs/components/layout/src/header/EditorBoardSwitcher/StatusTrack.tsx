import type { FC } from 'react';
import type { DocMode } from './type';
import { styled } from '@toeverything/components/ui';
import { StatusIcon } from './StatusIcon';

interface StatusTrackProps {
    mode: DocMode;
    onClick: () => void;
}

export const StatusTrack: FC<StatusTrackProps> = ({ mode, onClick }) => {
    return (
        <Container onClick={onClick}>
            <StatusIcon mode={mode} />
        </Container>
    );
};

const Container = styled('div')(({ theme }) => {
    return {
        backgroundColor: theme.affine.palette.textHover,
        borderRadius: '5px',
        height: '30px',
        width: '63px',
        cursor: 'pointer',
        padding: '5px',
    };
});
