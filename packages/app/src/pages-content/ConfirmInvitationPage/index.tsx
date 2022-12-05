import { useRouter } from 'next/router';
import { AlreadyJoined } from './AlreadyJoined';
import { Confirm } from './Confirm';
import { LinkExpired } from './LinkExpired';

export const ConfirmInvitation = () => {
  const router = useRouter();
  // Temporary code. The code should be returned by request.
  const { code } = router.query;
  const Component = {
    '-1': LinkExpired,
    0: Confirm,
    1: AlreadyJoined,
  }[code as string];
  return (
    <div>
      <h1>Confirm Invitation</h1>
      {Component ? <Component /> : null}
    </div>
  );
};
