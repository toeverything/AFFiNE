import { isYoutubeUrl, parseYoutubeId } from './youtube';
import { isFigmaUrl, toFigmaEmbedUrl } from './figma';
import { isAffineUrl, toAffineEmbedUrl } from './affine';

export const formatUrl = (url?: string): undefined | string => {
    if (isYoutubeUrl(url)) {
        const youtubeId = parseYoutubeId(url);
        return youtubeId ? `https://www.youtube.com/embed/${youtubeId}` : url;
    }
    if (isFigmaUrl(url)) {
        return toFigmaEmbedUrl(url);
    }
    if (isAffineUrl(url)) {
        return toAffineEmbedUrl(url);
    }
    return url;
};
