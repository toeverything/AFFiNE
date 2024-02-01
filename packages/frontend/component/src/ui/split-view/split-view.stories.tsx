import type { StoryFn } from '@storybook/react';
import { useCallback } from 'react';

import SplitView from './split-view';
import * as styles from './split-view.stories.css';

export default {
  title: 'UI/SplitView',
};

const RenderRed = () => {
  return <div className={styles.renderRed}></div>;
};
const RenderGreen = () => {
  return <div className={styles.renderGreen}></div>;
};
const RenderBlue = () => {
  return <div className={styles.renderBlue}></div>;
};

const initPanels = [
  {
    id: '1',
    percent: 100,
    children: <RenderRed />,
  },
];

const Template = () => {
  const redRenderer = useCallback(() => <RenderRed />, []);
  const greenRenderer = useCallback(() => <RenderGreen />, []);
  const blueRenderer = useCallback(() => <RenderBlue />, []);
  const previewRender = useCallback(({ readyToDrop }: any) => {
    return (
      <div className={styles.preview} data-ready-to-drop={readyToDrop}>
        Custom preview
        {readyToDrop ? (
          <>
            <br />
            (Ready for drop)
          </>
        ) : null}
      </div>
    );
  }, []);

  return (
    <SplitView.Provider initPanels={initPanels}>
      <div className={styles.wrapper}>
        <div className={styles.sidebar}>
          <SplitView.Trigger
            contentRenderer={redRenderer}
            className={styles.dragItem}
          >
            Red Block
          </SplitView.Trigger>

          <SplitView.Trigger
            contentRenderer={greenRenderer}
            className={styles.dragItem}
            previewRenderer={previewRender}
          >
            Green Block
          </SplitView.Trigger>

          <SplitView.Trigger
            contentRenderer={blueRenderer}
            className={styles.dragItem}
          >
            Blue Block
          </SplitView.Trigger>
        </div>
        <SplitView.Root limit={4} className={styles.content} />
      </div>
    </SplitView.Provider>
  );
};

export const Basic: StoryFn = Template.bind(undefined);
