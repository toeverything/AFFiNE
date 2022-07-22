const _regex =
    /^(https?:\/\/(localhost:4200|(nightly|app)\.affine\.pro|.*?\.ligo-virgo\.pages\.dev)\/\w{28}\/)?(affine\w{16})(\/whiteboard)?$/;

export const isAffineUrl = (url?: string) => {
    if (!url) return false;
    return _regex.test(url);
};

export const toAffineEmbedUrl = (url: string) => {
    return _regex.exec(url)?.[4];
};
