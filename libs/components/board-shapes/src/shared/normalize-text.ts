const fixNewLines = /\r?\n|\r/g;

export function normalizeText(text: string) {
    return text
        .replace(fixNewLines, '\n')
        .split('\n')
        .map(x => x || ' ')
        .join('\n');
}
