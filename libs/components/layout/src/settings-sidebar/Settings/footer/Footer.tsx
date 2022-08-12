import { styled } from '@toeverything/components/ui';
import { LastModified } from './LastModified';
import { Logout } from './Logout';

export const Footer = () => {
    return (
        <Container>
            <LastModified />
            <Logout />
        </Container>
    );
};

const Container = styled('div')({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px',
});
