import * as RadixSwitch from '@radix-ui/react-switch';

import { root, thump } from './index.css';

export const Switch = () => {
  return (
    <form>
      <div>
        <label>Test</label>
      </div>
      <RadixSwitch.Root className={root}>
        <RadixSwitch.Thumb className={thump} />
      </RadixSwitch.Root>
    </form>
  );
};
