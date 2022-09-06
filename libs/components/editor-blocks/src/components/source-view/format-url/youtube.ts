export const isYoutubeUrl = (url?: string): boolean => {
    if (!url) return false;
    const allowedHosts = ['www.youtu.be', 'www.youtube.com'];
    const host = new URL(url).host;
    return allowedHosts.includes(host);
};

const _regexp = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*).*/;

export const parseYoutubeId = (url?: string): undefined | string => {
    if (!url) {
        return undefined;
    }
    const matched = url.match(_regexp);
    return matched && matched[1].length === 11 ? matched[1] : undefined;
};
