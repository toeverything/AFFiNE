import type { ToolbarContext } from '@blocksuite/affine-shared/services';
import type { EdgelessExportOptions } from '../components/EdgelessExportDialog';

/**
 * Export the edgeless canvas/frame/selection as PNG or SVG and trigger download.
 * This is a stub; you should implement actual rendering logic for your app.
 */
export async function exportEdgelessImage(ctx: ToolbarContext, options: EdgelessExportOptions) {
  // TODO: Get the correct surface/canvas/frame/selection from ctx
  // For now, just create a dummy SVG/PNG
  if (options.format === 'svg') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='${options.background === 'white' ? '#fff' : 'none'}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='32'>Edgeless Export SVG</text></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'edgeless-export.svg');
    URL.revokeObjectURL(url);
  } else {
    // PNG: render to canvas
    const canvas = document.createElement('canvas');
    canvas.width = 800 * options.resolution;
    canvas.height = 600 * options.resolution;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      if (options.background === 'white') {
        ctx2d.fillStyle = '#fff';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx2d.font = `${32 * options.resolution}px sans-serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillStyle = '#333';
      ctx2d.fillText('Edgeless Export PNG', canvas.width / 2, canvas.height / 2);
    }
    canvas.toBlob(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        triggerDownload(url, 'edgeless-export.png');
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
