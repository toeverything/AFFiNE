import type { EditorHost } from '@blocksuite/block-std';
import type { EdgelessRootService } from '@blocksuite/blocks';
import type { BlockSnapshot } from '@blocksuite/store';

import { markdownToSnapshot } from '../_common/markdown-utils.js';
import { getSurfaceElementFromEditor } from '../_common/selection-utils.js';
import { basicTheme } from '../slides/template.js';

type PPTSection = {
  title: string;
  content: string;
  keywords: string;
};

type PPTDoc = {
  isCover: boolean;
  title: string;
  sections: PPTSection[];
};

export const PPTBuilder = (host: EditorHost) => {
  const service = host.spec.getService<EdgelessRootService>('affine:page');
  const docs: PPTDoc[] = [];
  let done = false;
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

    if (doc.sections.length !== 3 || doc.isCover) return;
    if (done) return;
    done = true;
    const job = service.createTemplateJob('template');
    const { images, content } = await basicTheme(doc);

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
    getSurfaceElementFromEditor(host).refresh();
  };

  return {
    process: async (text: string) => {
      const snapshot = await markdownToSnapshot(text, host);

      const block = snapshot.snapshot.content[0];
      for (const child of block.children) {
        await addDoc(child);
        const { centerX, centerY, zoom } = service.getFitToScreenData();
        service.viewport.setViewport(zoom, [centerX, centerY]);
      }
    },
    done: async (text: string) => {
      const snapshot = await markdownToSnapshot(text, host);
      const block = snapshot.snapshot.content[0];
      await addDoc(block.children[block.children.length - 1]);
    },
  };
};

const getText = (block: BlockSnapshot) => {
  // @ts-expect-error allow
  return block.props.text?.delta?.[0]?.insert ?? '';
};
