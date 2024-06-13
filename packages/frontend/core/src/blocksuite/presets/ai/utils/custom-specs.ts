import { PageEditorBlockSpecs, PageRootService } from '@blocksuite/blocks';
import { literal } from 'lit/static-html.js';

/**
 * Custom PageRootService that does not load fonts
 */
class CustomPageRootService extends PageRootService {
  override loadFonts() {}
}

export const CustomPageEditorBlockSpecs = PageEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:page') {
    return {
      ...spec,
      service: CustomPageRootService,
      view: {
        component: literal`affine-page-root`,
      },
    };
  }
  return spec;
});
