// static server for web app
import express from 'express';
const app = express();

const PORT = process.env.PORT || 8080;

app.use('/', express.static('out'));

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
