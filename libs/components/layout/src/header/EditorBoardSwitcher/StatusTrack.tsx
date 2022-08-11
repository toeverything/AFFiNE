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
        width: '64px',
        height: '32px',
        border: '1px solid #ECF1FB',
        borderRadius: '8px',
        cursor: 'pointer',
        margin: '0 8px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
    };
});
