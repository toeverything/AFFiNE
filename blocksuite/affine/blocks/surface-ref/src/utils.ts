import { isFrameBlock } from '@blocksuite/affine-block-frame';
import {
  GroupElementModel,
  MindmapElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import {
  EdgelessIcon,
  FrameIcon,
  GroupIcon,
  MindmapIcon,
} from '@blocksuite/icons/lit';
import { type GfxModel } from '@blocksuite/std/gfx';
import { html, type TemplateResult } from 'lit';

export const noContentPlaceholder = html`
  <svg
    width="182"
    height="182"
    viewBox="0 0 182 182"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="37.645"
      y="37.6452"
      width="106.71"
      height="106.71"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M91 144.234L37.7664 91.0003L91 37.7666L144.234 91.0003L91 144.234Z"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M90.564 37.352C99.4686 32.1345 109.836 29.1436 120.902 29.1436C154.093 29.1436 181 56.0502 181 89.2413C181 113.999 166.03 135.259 144.648 144.466"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M144.465 90.707C149.683 99.6117 152.674 109.979 152.674 121.045C152.674 154.236 125.767 181.143 92.5759 181.143C67.8187 181.143 46.5579 166.173 37.3516 144.791"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M91.436 144.465C82.5314 149.683 72.1639 152.674 61.0978 152.674C27.9068 152.674 1.0001 125.767 1.0001 92.576C1.00011 67.8188 15.9701 46.558 37.3519 37.3518"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M37.3518 91.436C32.1342 82.5314 29.1433 72.1639 29.1433 61.0978C29.1433 27.9067 56.05 1.00002 89.241 1.00001C113.998 1.00001 135.259 15.97 144.465 37.3518"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M37.3518 37.3521L144.648 144.649"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path
      d="M144.648 37.3521L37.3518 144.649"
      stroke="#D2D2D2"
      stroke-width="0.586319"
    />
    <path d="M91 37.3521V144.649" stroke="#D2D2D2" stroke-width="0.586319" />
    <path d="M144.648 91L37.3518 91" stroke="#D2D2D2" stroke-width="0.586319" />
    <ellipse cx="144.355" cy="37.645" rx="4.39739" ry="4.3974" fill="#5B5B5B" />
    <ellipse
      cx="144.355"
      cy="144.355"
      rx="4.39739"
      ry="4.3974"
      fill="#5B5B5B"
    />
    <ellipse
      cx="144.355"
      cy="90.9999"
      rx="4.39739"
      ry="4.3974"
      fill="#5B5B5B"
    />
    <ellipse cx="37.645" cy="37.645" rx="4.39739" ry="4.3974" fill="#5B5B5B" />
    <ellipse cx="37.645" cy="144.355" rx="4.39739" ry="4.3974" fill="#5B5B5B" />
    <ellipse cx="37.645" cy="90.9999" rx="4.39739" ry="4.3974" fill="#5B5B5B" />
    <ellipse
      cx="90.9999"
      cy="37.6451"
      rx="4.3974"
      ry="4.39739"
      transform="rotate(-90 90.9999 37.6451)"
      fill="#5B5B5B"
    />
    <ellipse
      cx="90.9999"
      cy="90.4136"
      rx="4.3974"
      ry="4.39739"
      transform="rotate(-90 90.9999 90.4136)"
      fill="#5B5B5B"
    />
    <ellipse
      cx="90.9999"
      cy="144.356"
      rx="4.3974"
      ry="4.39739"
      transform="rotate(-90 90.9999 144.356)"
      fill="#5B5B5B"
    />
  </svg>
`;

export const TYPE_ICON_MAP: {
  [key: string]: {
    name: string;
    icon: TemplateResult;
  };
} = {
  'affine:frame': {
    name: 'Frame',
    icon: FrameIcon(),
  },
  group: {
    name: 'Group',
    icon: GroupIcon(),
  },
  mindmap: {
    name: 'Mind map',
    icon: MindmapIcon(),
  },
  edgeless: {
    name: 'Edgeless content',
    icon: EdgelessIcon(),
  },
};

export const getReferenceModelTitle = (model: GfxModel) => {
  if (model instanceof GroupElementModel) {
    return model.title.toString();
  }
  if (isFrameBlock(model)) {
    return model.props.title.toString();
  }
  if (model instanceof MindmapElementModel) {
    const rootElement = model.tree.element;
    if (rootElement instanceof ShapeElementModel) {
      return rootElement.text?.toString() ?? '';
    }
  }
  return null;
};
