import { Button } from '@affine/component';

import * as styles from './animate-in-tooltip.css';

interface AnimateInTooltipProps {
  onNext: () => void;
  visible?: boolean;
}

export const AnimateInTooltip = ({
  onNext,
  visible,
}: AnimateInTooltipProps) => {
  return (
    <>
      <div className={styles.tooltip}>
        AFFiNE is a workspace with fully merged docs, <br />
        whiteboards and databases
      </div>
      <div className={styles.next}>
        {visible ? (
          <Button variant="primary" size="extraLarge" onClick={onNext}>
            Next
          </Button>
        ) : null}
      </div>
    </>
  );
};
