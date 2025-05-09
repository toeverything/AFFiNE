import { BackButton } from '@affine/component/auth-components';
import { type Dispatch, type SetStateAction, useCallback } from 'react';

import type { SignInState } from '.';

interface BackButtonProps {
  changeState: Dispatch<SetStateAction<SignInState>>;
}
export function Back({ changeState }: BackButtonProps) {
  const onClick = useCallback(() => {
    changeState(prev => ({
      ...prev,
      step: 'signIn',
    }));
  }, [changeState]);

  return <BackButton onClick={onClick} />;
}
