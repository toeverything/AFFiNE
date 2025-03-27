import type { ParagraphType } from '@blocksuite/affine-model';
import {
  BulletedListIcon,
  CheckBoxCheckLinearIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  NumberedListIcon,
  QuoteIcon,
  TextIcon,
} from '@blocksuite/icons/lit';
import type { BlockModel } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

export const getIcon = (
  model: BlockModel & {
    props: {
      type?: string;
    };
  }
): TemplateResult => {
  if (model.flavour === 'affine:paragraph') {
    const type = model.props.type as ParagraphType;
    return (
      {
        text: TextIcon(),
        quote: QuoteIcon(),
        h1: Heading1Icon(),
        h2: Heading2Icon(),
        h3: Heading3Icon(),
        h4: Heading4Icon(),
        h5: Heading5Icon(),
        h6: Heading6Icon(),
      } as Record<ParagraphType, TemplateResult>
    )[type];
  }
  if (model.flavour === 'affine:list') {
    return (
      {
        bulleted: BulletedListIcon(),
        numbered: NumberedListIcon(),
        todo: CheckBoxCheckLinearIcon(),
      }[model.props.type ?? 'bulleted'] ?? BulletedListIcon()
    );
  }
  return TextIcon();
};
