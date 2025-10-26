export const encodeLink = (link: string) =>
  encodeURI(link)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/(\?|&)response-content-disposition=attachment.*$/, '');
