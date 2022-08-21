import { styled } from '@toeverything/components/ui';
import { StatusIcon } from './StatusIcon';
import type { DocMode } from './type';

interface StatusTrackProps {
    mode: DocMode;
    onClick: () => void;
}

export const StatusTrack = ({ mode, onClick }: StatusTrackProps) => {
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
