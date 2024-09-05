import { Button } from '@affine/component/ui/button';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import { PresentationIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './styles.css';

export const PresentButton = () => {
  const t = useI18n();
  const editorService = useService(EditorService);
  const isPresent = useLiveData(editorService.editor.isPresenting$);

  return (
    <Button
      prefix={<PresentationIcon />}
      className={styles.presentButton}
      onClick={() => editorService.editor.togglePresentation()}
      disabled={isPresent}
    >
      {t['com.affine.share-page.header.present']()}
    </Button>
  );
};
