// static server for web app
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
const app = express();

const PORT = process.env.PORT || 8080;

app.use('/', express.static('out'));

app.use(
  '/api/auth',
  createProxyMiddleware({
    target: 'http://localhost:3010/api/auth',
    pathFilter: ['**'],
    changeOrigin: true,
  })
);

app.use(
  '/graphql',
  createProxyMiddleware({
    target: 'http://localhost:3010/graphql',
    changeOrigin: true,
  })
);

app.use(
  '/socket.io',
  createProxyMiddleware({
    target: 'http://localhost:3010/socket.io/',
    changeOrigin: true,
  })
);

app.use('/_debug/*', express.static('out/_debug/*.html'));
app.use(
  '/workspace/*/all',
  express.static('out/workspace/[workspaceId]/all.html')
);
app.use(
  '/workspace/*/setting',
  express.static('out/workspace/[workspaceId]/all.html')
);
app.use(
  '/workspace/*/shared',
  express.static('out/workspace/[workspaceId]/shared.html')
);
app.use(
  '/workspace/*/trash',
  express.static('out/workspace/[workspaceId]/trash.html')
);
app.use(
  '/workspace/*/*',
  express.static('out/workspace/[workspaceId]/[pageId].html')
);
app.use('/*', express.static('out/404.html'));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
