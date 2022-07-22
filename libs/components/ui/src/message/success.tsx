import type { FC } from 'react';
import { styled } from '../styled';
import type { ContainerProps } from './types';

export const Success: FC<ContainerProps> = ({ content }) => {
    return <Container>{content}</Container>;
};

const Container = styled('div')({
    maxWidth: '200px',
    backgroundColor: 'rgba(64, 223, 155)',
    borderRadius: '4px',
    padding: '8px',
});
