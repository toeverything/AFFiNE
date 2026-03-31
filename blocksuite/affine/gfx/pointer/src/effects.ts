import { EdgelessDefaultToolButton } from './quick-tool/default-tool-button';
import { EdgelessHistoryToolGroup } from './quick-tool/history-tool-group';

export function effects() {
  customElements.define(
    'edgeless-default-tool-button',
    EdgelessDefaultToolButton
  );
  customElements.define(
    'edgeless-history-tool-group',
    EdgelessHistoryToolGroup
  );
}
