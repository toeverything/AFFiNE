import { Button } from '@affine/component';

import * as styles from './animate-in-tooltip.css';

export const AnimateInTooltip = ({ onNext }: { onNext: () => void }) => {
  return (
    <>
      <div className={styles.tooltip}>
        AFFiNE is a workspace with fully merged docs, <br />
        whiteboards and databases
      </div>
      <div className={styles.next}>
        <Button type="primary" size="extraLarge" onClick={onNext}>
          Next
        </Button>
      </div>
    </>
  );
};
