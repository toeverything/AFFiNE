import type { SurfaceBlockProps } from '@blocksuite/affine/block-std/gfx';
import {
  NoteDisplayMode,
  type NoteProps,
  type ParagraphProps,
  type RootBlockProps,
} from '@blocksuite/affine/blocks';
import { type Doc, Text } from '@blocksuite/affine/store';

export interface DocProps {
  page?: Partial<RootBlockProps>;
  surface?: Partial<SurfaceBlockProps>;
  note?: Partial<NoteProps>;
  paragraph?: Partial<ParagraphProps>;
}

export function initEmptyDoc(doc: Doc, title?: string) {
  doc.load(() => {
    initDocFromProps(doc, {
      page: {
        title: new Text(title),
      },
    });
  });
}

export function initDocFromProps(doc: Doc, props?: DocProps) {
  doc.load(() => {
    const pageBlockId = doc.addBlock(
      'affine:page',
      props?.page || { title: new Text('') }
    );
    doc.addBlock('affine:surface', props?.surface || {}, pageBlockId);
    const noteBlockId = doc.addBlock(
      'affine:note',
      {
        ...props?.note,
        displayMode: NoteDisplayMode.DocAndEdgeless,
      },
      pageBlockId
    );
    doc.addBlock('affine:paragraph', props?.paragraph || {}, noteBlockId);
    doc.history.clear();
  });
}
