import { createTemplateJob } from '@blocksuite/affine/gfx/template';
import type { EditorHost } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import type { BlockSnapshot } from '@blocksuite/affine/store';

import { markdownToSnapshot } from '../../utils';
import { getSurfaceElementFromEditor } from '../utils/selection-utils';
import {
  basicTheme,
  type PPTDoc,
  type PPTSection,
  type TemplateImage,
} from './template';

export const PPTBuilder = (host: EditorHost) => {
  const gfx = host.std.get(GfxControllerIdentifier);
  const docs: PPTDoc[] = [];
  const contents: unknown[] = [];
  const allImages: TemplateImage[][] = [];

  const addDoc = async (block: BlockSnapshot) => {
    const sections = block.children.map(v => {
      const title = getText(v);
      const keywords = getText(v.children[0]);
      const content = getText(v.children[1]);
      return {
        title,
        keywords,
        content,
      } satisfies PPTSection;
    });
    const doc: PPTDoc = {
      isCover: docs.length === 0,
      title: getText(block),
      sections,
    };
    docs.push(doc);

    const job = createTemplateJob(host.std, 'template');
    const { images, content } = await basicTheme(doc);
    contents.push(content);
    allImages.push(images);
    if (images.length) {
      await Promise.all(
        images.map(({ id, url }) =>
          fetch(url)
            .then(res => res.blob())
            .then(blob => job.job.assets.set(id, blob))
        )
      );
    }
    await job.insertTemplate(content);
    getSurfaceElementFromEditor(host)?.refresh();
  };

  return {
    process: async (text: string) => {
      try {
        const snapshot = await markdownToSnapshot(text, host.store, host);

        const block = snapshot.snapshot?.content[0];
        if (!block) {
          return;
        }
        for (const child of block.children) {
          await addDoc(child);
          gfx.fitToScreen();
        }
      } catch (e) {
        console.error(e);
      }

      return { contents, images: allImages };
    },
    done: async (text: string) => {
      const snapshot = await markdownToSnapshot(text, host.store, host);
      const block = snapshot.snapshot?.content[0];
      if (!block) {
        return;
      }
      await addDoc(block.children[block.children.length - 1]);
    },
  };
};

const getText = (block: BlockSnapshot) => {
  // @ts-expect-error allow
  return block.props.text?.delta?.[0]?.insert ?? '';
};
