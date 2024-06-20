import { Button } from '@affine/component/ui/button';
import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import { useI18n } from '@affine/i18n';
import type { EdgelessRootService } from '@blocksuite/blocks';
import { PresentationIcon } from '@blocksuite/icons/rc';
import { useCallback, useEffect, useState } from 'react';

import * as styles from './styles.css';

export const PresentButton = () => {
  const t = useI18n();
  const [isPresent, setIsPresent] = useState(false);
  const [editor] = useActiveBlocksuiteEditor();

  const handlePresent = useCallback(() => {
    const editorHost = editor?.host;
    if (!editorHost || isPresent) return;

    // TODO: use surfaceService subAtom
    const enterPresentationMode = () => {
      const edgelessRootService = editorHost.spec.getService(
        'affine:page'
      ) as EdgelessRootService;

      if (
        !edgelessRootService ||
        edgelessRootService.tool.edgelessTool.type === 'frameNavigator'
      ) {
        return;
      }

      edgelessRootService.tool.setEdgelessTool({ type: 'frameNavigator' });
    };

    enterPresentationMode();
    setIsPresent(true);
  }, [editor?.host, isPresent]);

  useEffect(() => {
    if (!isPresent) return;

    const editorHost = editor?.host;
    if (!editorHost) return;

    const edgelessPage = editorHost?.querySelector('affine-edgeless-root');
    if (!edgelessPage) return;

    return edgelessPage.slots.edgelessToolUpdated.on(() => {
      setIsPresent(edgelessPage.edgelessTool.type === 'frameNavigator');
    }).dispose;
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
