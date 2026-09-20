export const encodeLink = (link: string) =>
  encodeURI(link)
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replace(/(\?|&)response-content-disposition=attachment.*$/, '');
