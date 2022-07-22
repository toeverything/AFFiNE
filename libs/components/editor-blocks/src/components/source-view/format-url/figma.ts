export const isFigmaUrl = (url?: string) => {
    if (!url) {
        return false;
    }
    return /https:\/\/([\w.-]+\.)?figma.com\/(file|proto)\/([0-9a-zA-Z]{22,128})(?:\/.*)?$/.test(
        url
    );
};

export const toFigmaEmbedUrl = (url: string) => {
    return `https://www.figma.com/embed?embed_host=affine&url=${url}`;
};
