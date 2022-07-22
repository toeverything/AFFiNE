import { Link } from 'react-router-dom';
import { LogoImg } from './LogoImg';
import { styled } from '@toeverything/components/ui';

export const LogoLink = () => {
    return (
        <StyledLink to="/">
            <LogoImg style={{ width: 56, height: 56 }} />
        </StyledLink>
    );
};

const StyledLink = styled(Link)`
    display: flex;
    align-items: center;
    justify-content: center;
`;
