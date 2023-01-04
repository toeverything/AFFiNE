import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

const Container = styled.div`
  display: flex;
  flex-direction: column;

  & > a {
    color: #333;
    padding: 10px;
    &:hover {
      opacity: 0.7;
    }
  }
`;

export function LandingPage() {
  return (
    <Container>
      <Link to="/affine-dev">Affine Dev Build</Link>
      <Link to="/affine">Affine Dist Bundle</Link>
    </Container>
  );
}
