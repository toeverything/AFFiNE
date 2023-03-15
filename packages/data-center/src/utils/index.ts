import { __unstableSchemas, builtInSchemas } from '@blocksuite/blocks/models';
import type { StoreOptions } from '@blocksuite/store';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';

export const createBlocksuiteWorkspace = (options: StoreOptions) => {
  return new BlocksuiteWorkspace({
    defaultFlags: {},
    isSSR: typeof window === 'undefined',
    ...options,
  })
    .register(builtInSchemas)
    .register(__unstableSchemas);
};

const DefaultHeadImgColors = [
  ['#C6F2F3', '#0C6066'],
  ['#FFF5AB', '#896406'],
  ['#FFCCA7', '#8F4500'],
  ['#FFCECE', '#AF1212'],
  ['#E3DEFF', '#511AAB'],
];

export async function getDefaultHeadImgBlob(
  workspaceName: string
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.height = 100;
  canvas.width = 100;
  if (!canvas.getContext) {
    return Promise.resolve(null);
  }
  const ctx = canvas.getContext('2d');
  return new Promise<Blob>((resolve, reject) => {
    if (ctx) {
      const randomNumber = Math.floor(Math.random() * 5);
      const randomColor = DefaultHeadImgColors[randomNumber];
      ctx.fillStyle = randomColor[0];
      ctx.fillRect(0, 0, 100, 100);
      ctx.font = "600 50px 'PingFang SC', 'Microsoft Yahei'";
      ctx.fillStyle = randomColor[1];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(workspaceName[0], 50, 50);
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject();
        }
      }, 'image/png');
    } else {
      reject();
    }
  });
}

export const applyUpdate = async (
  blocksuiteWorkspace: BlocksuiteWorkspace,
  updates: Uint8Array
) => {
  if (updates && updates.byteLength) {
    await new Promise(resolve => {
      // FIXME: if we merge two empty doc, there will no update event.
      // So we set a timer to cancel update listener.
      const doc = blocksuiteWorkspace.doc;
      const timer = setTimeout(() => {
        doc.off('update', resolve);
        resolve(undefined);
      }, 1000);
      doc.once('update', () => {
        clearTimeout(timer);
        setTimeout(resolve, 100);
      });
      BlocksuiteWorkspace.Y.applyUpdate(doc, new Uint8Array(updates));
    });
  }
};
