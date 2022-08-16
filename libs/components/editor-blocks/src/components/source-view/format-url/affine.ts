const _regex =
    /^(https?:\/\/(localhost:4200|(nightly|app|livedemo)\.affine\.pro|.*?\.ligo-virgo\.pages\.dev)\/(\w{28}|AFFiNE)\/)?(affine[\w\-_]{16})(\/edgeless)?$/;

export const isAffineUrl = (url?: string) => {
    if (!url) return false;
    return _regex.test(url);
};

export const toAffineEmbedUrl = (url: string) => {
    return _regex.exec(url)?.[5];
};
