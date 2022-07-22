import type { FC, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { styled } from '../styled';

import type { ContainerProps } from './types';

interface ShowProps {
    Container: FC<ContainerProps>;
    /**
     * 自动关闭延时，单位毫秒。设为 0 时，不自动关闭。默认 2000
     */
    duration?: number;
    content: ReactNode;
}

export const show = ({ Container, duration = 2000, content }: ShowProps) => {
    const root_element = document.createElement('div');
    document.body.appendChild(root_element);

    function close() {
        document.body.removeChild(root_element);
    }

    const react_root = createRoot(root_element);

    react_root.render(
        <PortalContainer>
            <Container content={content} duration={duration} close={close} />
        </PortalContainer>
    );

    if (duration > 0) {
        setTimeout(() => {
            close();
        }, duration);
    }

    return close;
};

const PortalContainer = styled('div')({
    position: 'fixed',
    top: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#fff',
    zIndex: 100,
});
