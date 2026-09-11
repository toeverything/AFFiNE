import { BoardBlockComponent } from './blocks/board/board-block';
import { BoardEdgelessBlockComponent } from './blocks/board/board-edgeless-block';
import { BoardPreviewBlockComponent } from './blocks/board/board-preview-block';
import { ChartBlockComponent } from './blocks/chart/chart-block';
import { ChartEdgelessBlockComponent } from './blocks/chart/chart-edgeless-block';
import { ChartPreviewBlockComponent } from './blocks/chart/chart-preview-block';
import { HelloBlockComponent } from './blocks/hello/hello-block';
import { HelloEdgelessBlockComponent } from './blocks/hello/hello-edgeless-block';
import { HelloPreviewBlockComponent } from './blocks/hello/hello-preview-block';
import { SketchBlockComponent } from './blocks/sketch/sketch-block';
import { SketchEdgelessBlockComponent } from './blocks/sketch/sketch-edgeless-block';
import { SketchPreviewBlockComponent } from './blocks/sketch/sketch-preview-block';

export function effects() {
  customElements.define('wb-hello', HelloBlockComponent);
  customElements.define('wb-hello-edgeless', HelloEdgelessBlockComponent);
  customElements.define('wb-hello-preview', HelloPreviewBlockComponent);

  customElements.define('wb-chart', ChartBlockComponent);
  customElements.define('wb-chart-edgeless', ChartEdgelessBlockComponent);
  customElements.define('wb-chart-preview', ChartPreviewBlockComponent);

  customElements.define('wb-sketch', SketchBlockComponent);
  customElements.define('wb-sketch-edgeless', SketchEdgelessBlockComponent);
  customElements.define('wb-sketch-preview', SketchPreviewBlockComponent);

  customElements.define('wb-board', BoardBlockComponent);
  customElements.define('wb-board-edgeless', BoardEdgelessBlockComponent);
  customElements.define('wb-board-preview', BoardPreviewBlockComponent);
}
