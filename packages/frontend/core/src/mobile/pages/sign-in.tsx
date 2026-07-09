// oxlint-disable-next-line no-restricted-imports
import { useNavigate } from 'react-router-dom';

import { MobileSignInPanel } from '../components/sign-in';

export const Component = () => {
  const navigate = useNavigate();

  return <MobileSignInPanel onClose={() => navigate('/')} />;
};
