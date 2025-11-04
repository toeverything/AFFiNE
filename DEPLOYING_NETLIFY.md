# Deploying the AFFiNE Web App to Netlify

This sets up the frontend (static web app) on Netlify and proxies API/GraphQL/WebSocket traffic to your backend server.

Prerequisites
- A running AFFiNE backend with HTTPS and a public base URL, e.g. https://your-backend.example.com.
- The branch `feat/ai-providers-admin-and-config` (or merged to your default branch).

What’s already in the repo
- `netlify.toml` at the repo root:
  - Build: `yarn --immutable && yarn workspace @affine/web build`
  - Publish dir: `packages/frontend/apps/web/dist`
  - Redirects for `/api/*`, `/graphql`, `/socket.io/*` to `${AFFINE_BACKEND_URL}`
  - SPA fallback to `/index.html`

Steps
1) Push the branch

```bash
git checkout feat/ai-providers-admin-and-config
git push -u origin feat/ai-providers-admin-and-config
```

2) In Netlify, connect your Git repo
- New site from Git → select the repo/branch.
- Build command: `yarn --immutable && yarn workspace @affine/web build`
- Publish directory: `packages/frontend/apps/web/dist`

3) Add environment variables (Site settings → Environment)
- `AFFINE_BACKEND_URL` = `https://your-backend.example.com`

Optional environment values
- If you’re using feature flags or custom build behavior, mirror any additional envs required by your setup.

4) Deploy
- Trigger a deploy (Netlify will also auto-deploy on each push).

5) Test
- Open the Netlify URL. The frontend will call backend endpoints via redirects defined in `netlify.toml`.

Notes
- Backend hosting: The AFFiNE backend must run on a server/VM/container platform (Docker recommended). Ensure CORS and TLS are properly configured.
- WebSockets: The `/socket.io/*` redirect is included for real-time features.
- OpenAI-compatible providers: You can set keys/base URLs from the Admin panel once logged in.
