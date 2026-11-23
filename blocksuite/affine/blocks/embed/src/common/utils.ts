import {
  EmbedCardDarkBannerIcon,
  EmbedCardDarkCubeIcon,
  EmbedCardDarkHorizontalIcon,
  EmbedCardDarkListIcon,
  EmbedCardDarkVerticalIcon,
  EmbedCardLightBannerIcon,
  EmbedCardLightCubeIcon,
  EmbedCardLightHorizontalIcon,
  EmbedCardLightListIcon,
  EmbedCardLightVerticalIcon,
} from '@blocksuite/affine-components/icons';
import { ColorScheme } from '@blocksuite/affine-model';
import { EmbedOptionProvider } from '@blocksuite/affine-shared/services';
import type { BlockStdScope } from '@blocksuite/std';
import type { TemplateResult } from 'lit';

type EmbedCardIcons = {
  EmbedCardBannerIcon: TemplateResult<1>;
  EmbedCardHorizontalIcon: TemplateResult<1>;
  EmbedCardListIcon: TemplateResult<1>;
  EmbedCardVerticalIcon: TemplateResult<1>;
  EmbedCardCubeIcon: TemplateResult<1>;
};

export function getEmbedCardIcons(theme: ColorScheme): EmbedCardIcons {
  if (theme === ColorScheme.Light) {
    return {
      EmbedCardBannerIcon: EmbedCardLightBannerIcon,
      EmbedCardHorizontalIcon: EmbedCardLightHorizontalIcon,
      EmbedCardListIcon: EmbedCardLightListIcon,
      EmbedCardVerticalIcon: EmbedCardLightVerticalIcon,
      EmbedCardCubeIcon: EmbedCardLightCubeIcon,
    };
  } else {
    return {
      EmbedCardBannerIcon: EmbedCardDarkBannerIcon,
      EmbedCardHorizontalIcon: EmbedCardDarkHorizontalIcon,
      EmbedCardListIcon: EmbedCardDarkListIcon,
      EmbedCardVerticalIcon: EmbedCardDarkVerticalIcon,
      EmbedCardCubeIcon: EmbedCardDarkCubeIcon,
    };
  }
}

export function canEmbedAsEmbedBlock(std: BlockStdScope, url: string) {
  const options = std.get(EmbedOptionProvider).getEmbedBlockOptions(url);
  return options?.viewType === 'embed';
}
