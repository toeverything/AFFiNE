import { PageMeta as OriginalPageMeta } from '@blocksuite/store/dist/workspace/workspace';

// export type PageMeta = {
//   favorite: boolean;
//   trash: boolean;
//   trashDate: number | void;
//   updatedDate: number | void;
//   mode: EditorContainer['mode'];
// } & OriginalPageMeta;

export interface PageMeta extends OriginalPageMeta {
  favorite: boolean;
  trash: boolean;
  trashDate: number;
  updatedDate: number;
  mode: 'edgeless' | 'page';
}
