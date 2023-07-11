export default {
  async fetch(request, _env, _ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/proxy/image')) {
      const imageURL = url.searchParams.get('url');

      if (!imageURL) {
        return new Response('Missing "url" parameter', { status: 400 });
      }

      const imageRequest = new Request(imageURL, {
        method: 'GET',
        headers: request.headers,
      });

      const response = await fetch(imageRequest);
      const modifiedResponse = new Response(response.body);
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET');

      return modifiedResponse;
    }
    return new Response('not found', { status: 404 });
  },
};
