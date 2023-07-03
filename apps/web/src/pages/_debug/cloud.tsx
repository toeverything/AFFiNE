import { Button, Input } from '@affine/component';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { registerMutation } from '@affine/graphql';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useId, useState } from 'react';

import { WorkspaceAdapters } from '../../adapters/workspace';
import { useMutation } from '../../shared/gql';

function CloudUnLoggedPage(): ReactElement {
  const { trigger } = useMutation({
    mutation: registerMutation,
  });
  const nameInputId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onClickRegister = useCallback(() => {
    trigger({
      name,
      email,
      password,
    })
      .then(console.log)
      .catch(console.error);
  }, [email, name, password, trigger]);

  return (
    <div>
      <div
        style={{
          padding: '10px',
          border: '1px solid red',
        }}
      >
        <div>
          <label id={nameInputId}>name</label>
          <Input id={nameInputId} value={name} onChange={setName} />
        </div>
        <div>
          <label htmlFor={emailInputId}>email</label>
          <Input id={emailInputId} value={email} onChange={setEmail} />
        </div>
        <div>
          <label htmlFor={passwordInputId}>password</label>
          <Input id={passwordInputId} value={password} onChange={setPassword} />
        </div>
        <Button onClick={onClickRegister}>register</Button>
      </div>
    </div>
  );
}

function CloudDevPageImpl(): ReactElement {
  const [login] = useState(false);
  return <div>{!login && <CloudUnLoggedPage />}</div>;
}

const Provider = WorkspaceAdapters[WorkspaceFlavour.AFFINE_CLOUD].UI.Provider;

export default function CloudDevPage(): ReactElement {
  return (
    <Provider>
      <Suspense fallback="loading...">
        <CloudDevPageImpl />
      </Suspense>
    </Provider>
  );
}
