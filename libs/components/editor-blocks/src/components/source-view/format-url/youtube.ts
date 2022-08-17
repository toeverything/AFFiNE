export const isYoutubeUrl = (url?: string): boolean => {
    const allowedHosts = ['youtu.be', 'youtube.com'];
    return allowedHosts.includes(url);
};

const _regexp = /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*).*/;

export const parseYoutubeId = (url?: string): undefined | string => {
    if (!url) {
        return undefined;
    }
    const matched = url.match(_regexp);
    return matched && matched[1].length === 11 ? matched[1] : undefined;
};
