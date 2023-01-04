import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { routes } from '../pages/routes.js';

const Container = styled.nav`
  height: var(--title-bar-height);
  background: #329ea3;
  user-select: none;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
`;
const RouteSelect = styled.select`
  margin-left: 100px;
`;

export function TitleBar() {
  const navigate = useNavigate();
  return (
    <Container data-tauri-drag-region>
      <RouteSelect
        onChange={event => {
          navigate(event?.target?.value);
        }}
      >
        {routes.map(route => (
          <option key={route.path} value={route.path}>
            {route.name}
          </option>
        ))}
      </RouteSelect>
    </Container>
  );
}
