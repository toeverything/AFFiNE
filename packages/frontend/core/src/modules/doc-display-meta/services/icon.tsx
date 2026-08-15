import { type IconData, IconRenderer, IconType } from '@affine/component';
import { getBlobIconUrl } from '@blocksuite/affine-shared/utils';
import * as litIcons from '@blocksuite/icons/lit';
import { html } from 'lit';
import { until } from 'lit/directives/until.js';

import { BlobIcon } from '../../explorer-icon/views/explorer-icon';

export const getDocIconComponent = (
  icon: IconData,
  Fallback?: React.ComponentType<React.SVGProps<SVGSVGElement>>
) => {
  if (icon.type === IconType.Blob && icon.blobId) {
    // Show the doc's default icon while the blob resolves (or if it's gone).
    const Icon = (props: React.SVGProps<SVGSVGElement>) => (
      <BlobIcon
        blobId={icon.blobId}
        fallback={Fallback ? <Fallback {...props} /> : null}
        {...props}
      />
    );
    Icon.displayName = 'DocIcon';
    return Icon;
  }
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <IconRenderer data={icon} {...props} />
  );
  Icon.displayName = 'DocIcon';
  return Icon;
};

export const getDocIconComponentLit = (
  icon: IconData,
  getBlob?: (blobId: string) => Promise<Blob | null>
) => {
  return () => {
    if (icon.type === IconType.Emoji) {
      return html`<div class="icon">${icon.unicode}</div>`;
    }
    if (icon.type === IconType.AffineIcon) {
      return html`<div
        style="color: ${icon.color}; display: flex; align-items: center; justify-content: center;"
      >
        ${litIcons[`${icon.name}Icon` as keyof typeof litIcons]()}
      </div>`;
    }
    if (icon.type === IconType.Blob && icon.blobId) {
      if (!getBlob) {
        return null;
      }
      return until(
        getBlobIconUrl(icon.blobId, getBlob).then(url =>
          url
            ? html`<img
                src=${url}
                alt=""
                style="width: 1em; height: 1em; object-fit: cover; border-radius: 4px; display: inline-block; vertical-align: middle;"
              />`
            : html``
        ),
        html``
      );
    }
    return null;
  };
};
