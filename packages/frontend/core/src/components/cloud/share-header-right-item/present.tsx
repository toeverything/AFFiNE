import { Button } from '@affine/component/ui/button';
import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { EdgelessPageService } from '@blocksuite/blocks';
import { PresentationIcon } from '@blocksuite/icons';
import { useCallback, useEffect, useState } from 'react';

import * as styles from './styles.css';

export const PresentButton = () => {
  const t = useAFFiNEI18N();
  const [isPresent, setIsPresent] = useState(false);
  const [editor] = useActiveBlocksuiteEditor();

  const handlePresent = useCallback(() => {
    const editorHost = editor?.host;
    if (!editorHost || isPresent) return;

    // TODO: use surfaceService subAtom
    const enterPresentationMode = () => {
      const edgelessPageService = editorHost.spec.getService(
        'affine:page'
      ) as EdgelessPageService;

      if (
        !edgelessPageService ||
        edgelessPageService.tool.edgelessTool.type === 'frameNavigator'
      ) {
        return;
      }

      edgelessPageService.tool.setEdgelessTool({ type: 'frameNavigator' });
    };

    enterPresentationMode();
    setIsPresent(true);
  }, [editor?.host, isPresent]);

  useEffect(() => {
    if (!isPresent) return;

    const editorHost = editor?.host;
    if (!editorHost) return;

    const edgelessPage = editorHost?.querySelector('affine-edgeless-page');
    if (!edgelessPage) return;

    edgelessPage.slots.edgelessToolUpdated.on(() => {
      setIsPresent(edgelessPage.edgelessTool.type === 'frameNavigator');
    });

    return () => {
      edgelessPage.slots.edgelessToolUpdated.dispose();
    };
  }, [editor?.host, isPresent]);

  return (
    <Button
      icon={<PresentationIcon />}
      className={styles.presentButton}
      onClick={handlePresent}
      disabled={isPresent}
      withoutHoverStyle
    >
      {t['com.affine.share-page.header.present']()}
    </Button>
  );
};
