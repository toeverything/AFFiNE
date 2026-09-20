const canonicalHost = 'blocksuite.io';
const redirectHosts = new Set([
  'blocksuite.affine.pro',
  'block-suite.com',
  'blocksite.dev',
  'blocksite.io',
  'blocksuit.dev',
  'blocksuit.io',
]);
const apiMemberPathPattern =
  /^\/api\/@blocksuite\/(.+)\/(classes|enumerations|functions|interfaces|type-aliases|variables)\/[^/]+\.html$/;

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (redirectHosts.has(url.hostname)) {
      url.hostname = canonicalHost;
      url.protocol = 'https:';

      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/blocksuite-overview.html') {
      url.pathname = '/guide/overview.html';

      return Response.redirect(url.toString(), 301);
    }

    const apiMemberPath = url.pathname.match(apiMemberPathPattern);

    if (apiMemberPath) {
      url.pathname = `/api/@blocksuite/${apiMemberPath[1]}.html`;

      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
