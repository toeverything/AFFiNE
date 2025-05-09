import type { FrameBlockModel } from '@blocksuite/affine-model';
import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';
import { Subject } from 'rxjs';
export const EdgelessLegacySlotIdentifier = createIdentifier<{
  readonlyUpdated: Subject<boolean>;
  navigatorSettingUpdated: Subject<{
    hideToolbar?: boolean;
    blackBackground?: boolean;
    fillScreen?: boolean;
  }>;
  navigatorFrameChanged: Subject<FrameBlockModel>;
  fullScreenToggled: Subject<void>;

  elementResizeStart: Subject<void>;
  elementResizeEnd: Subject<void>;
  toggleNoteSlicer: Subject<void>;

  toolbarLocked: Subject<boolean>;
}>('AffineEdgelessLegacySlotService');

export const EdgelessLegacySlotExtension: ExtensionType = {
  setup: di => {
    di.addImpl(EdgelessLegacySlotIdentifier, () => ({
      readonlyUpdated: new Subject<boolean>(),
      navigatorSettingUpdated: new Subject<{
        hideToolbar?: boolean;
        blackBackground?: boolean;
        fillScreen?: boolean;
      }>(),
      navigatorFrameChanged: new Subject<FrameBlockModel>(),
      fullScreenToggled: new Subject(),
      elementResizeStart: new Subject(),
      elementResizeEnd: new Subject(),
      toggleNoteSlicer: new Subject(),
      toolbarLocked: new Subject<boolean>(),
    }));
  },
};
