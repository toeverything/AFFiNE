/**
 * Standalone OnlyOffice version-history page.
 *
 * Opened in its own window from the attachment toolbar. Lists the stored
 * versions of an attachment, lets the user switch the attachment to a version
 * (posts a message back to the opener, which repoints the block) or delete a
 * version. Self-contained — no dependency on the AFFiNE frontend framework.
 *
 * `__PARAMS__` is replaced server-side with:
 *   { workspaceId, blobId, docId, blockId, filename, currentBlobId, configBase, origin }
 */
export const ONLYOFFICE_VERSIONS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Version history</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; color: #1f2329; padding: 16px; }
      h1 { font-size: 16px; margin: 0 0 12px; }
      .v { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }
      .v .meta { flex: 1; min-width: 0; }
      .v .when { font-size: 13px; }
      .v .sub { font-size: 12px; color: #8a8f99; }
      .v .cur { font-size: 11px; color: #1e9e6a; border: 1px solid #1e9e6a; border-radius: 4px; padding: 1px 6px; }
      button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #d0d5dd; background: #fff; cursor: pointer; }
      button.primary { background: #1e6fff; color: #fff; border-color: #1e6fff; }
      button.danger { color: #d92d20; border-color: #f0c2bd; }
      button:disabled { opacity: .5; cursor: default; }
      #msg { color: #8a8f99; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Version history</h1>
    <div id="list"></div>
    <div id="msg">Loading…</div>
    <script>
      var P = __PARAMS__;
      var listEl = document.getElementById('list');
      var msgEl = document.getElementById('msg');

      function fmtTime(ms) {
        try { return new Date(ms).toLocaleString(); } catch (e) { return String(ms); }
      }
      function fmtSize(n) {
        if (!n && n !== 0) return '';
        var u = ['B','KB','MB','GB']; var i = 0; var v = n;
        while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
        return v.toFixed(i ? 1 : 0) + ' ' + u[i];
      }
      function api(path) { return P.configBase + '/' + encodeURIComponent(P.workspaceId) + '/onlyoffice/' + path; }

      var canWrite = false;

      function render(versions) {
        listEl.innerHTML = '';
        if (!versions.length) { msgEl.textContent = 'No saved versions yet.'; return; }
        msgEl.textContent = '';
        // newest first
        versions.slice().reverse().forEach(function (v) {
          var row = document.createElement('div');
          row.className = 'v';
          var isCur = v.blobId === P.currentBlobId;
          var meta = document.createElement('div');
          meta.className = 'meta';
          meta.innerHTML = '<div class="when">' + fmtTime(v.createdAt) + '</div>' +
            '<div class="sub">' + fmtSize(v.size) + '</div>';
          row.appendChild(meta);
          if (isCur) {
            var cur = document.createElement('span'); cur.className = 'cur'; cur.textContent = 'Current';
            row.appendChild(cur);
          } else {
            var sw = document.createElement('button'); sw.className = 'primary'; sw.textContent = 'Switch to';
            sw.onclick = function () { switchTo(v); };
            row.appendChild(sw);
          }
          if (canWrite && !isCur) {
            var del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Delete';
            del.onclick = function () { removeVersion(v, del); };
            row.appendChild(del);
          }
          listEl.appendChild(row);
        });
      }

      function switchTo(v) {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'affine-onlyoffice-switch-version',
            workspaceId: P.workspaceId,
            docId: P.docId,
            blockId: P.blockId,
            blobId: v.blobId,
            size: v.size,
          }, P.origin);
          P.currentBlobId = v.blobId;
          load();
        }
      }

      async function removeVersion(v, btn) {
        btn.disabled = true;
        try {
          var qs = new URLSearchParams({ docId: P.docId, blockId: P.blockId });
          await fetch(api('delete-version/' + encodeURIComponent(v.blobId)) + '?' + qs.toString(),
            { credentials: 'include' });
          load();
        } catch (e) { btn.disabled = false; }
      }

      async function load() {
        try {
          var qs = new URLSearchParams({ docId: P.docId, blockId: P.blockId });
          var res = await fetch(api('versions/' + encodeURIComponent(P.blobId)) + '?' + qs.toString(),
            { credentials: 'include' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var data = await res.json();
          canWrite = !!data.canWrite;
          render(data.versions || []);
        } catch (e) {
          msgEl.textContent = 'Failed to load versions: ' + ((e && e.message) || e);
        }
      }
      load();
    </script>
  </body>
</html>`;
