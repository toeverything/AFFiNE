import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { BadRequest, Cache, Config, Mutex, URLHelper } from '../../base';
import { WorkspaceBlobStorage } from '../../core/storage';
import { ONLYOFFICE_EDITOR_HTML } from './editor-page';
import {
  getOnlyOfficeDocumentType,
  ONLYOFFICE_WRITABLE_MODES,
  type OnlyOfficeCallbackBody,
  type OnlyOfficeEditorConfig,
  type OnlyOfficeMode,
  type OnlyOfficeSaveResult,
  type OnlyOfficeVersion,
  type OnlyOfficeVersionManifest,
} from './types';

@Injectable()
export class OnlyOfficeService {
  private readonly logger = new Logger(OnlyOfficeService.name);

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly blobStorage: WorkspaceBlobStorage,
    private readonly cache: Cache,
    // Distributed (Redis-backed) mutex so manifest updates are serialized
    // across server instances, not just within one process.
    private readonly mutex: Mutex
  ) {}

  get enabled() {
    return (
      this.config.onlyoffice.enabled &&
      !!this.config.onlyoffice.documentServerUrl
    );
  }

  private get callbackHost() {
    // Address the Document Server uses to reach AFFiNE. Falls back to the
    // server's own external base url when not explicitly configured.
    return (
      this.config.onlyoffice.callbackHost.replace(/\/$/, '') || this.url.baseUrl
    );
  }

  private sign(payload: object, expiresInSeconds = 12 * 60 * 60): string {
    const secret = this.config.onlyoffice.jwtSecret;
    if (!secret) {
      throw new BadRequest('OnlyOffice jwtSecret is not configured.');
    }
    return jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Sign a short-lived token that authorizes the Document Server to download a
   * specific blob via the public download endpoint (no user session needed).
   * Kept short-lived because it travels in the URL query (and thus proxy logs).
   */
  signFileToken(workspaceId: string, blobId: string): string {
    return this.sign({ scope: 'onlyoffice-file', workspaceId, blobId }, 600);
  }

  /**
   * Verify a file-download token and assert it matches the requested blob.
   */
  verifyFileToken(
    token: string | undefined,
    workspaceId: string,
    blobId: string
  ): void {
    const secret = this.config.onlyoffice.jwtSecret;
    if (!secret) {
      throw new BadRequest('OnlyOffice jwtSecret is not configured.');
    }
    if (!token) {
      throw new BadRequest('Missing OnlyOffice file token.');
    }
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as {
        scope?: string;
        workspaceId?: string;
        blobId?: string;
      };
      if (
        decoded.scope !== 'onlyoffice-file' ||
        decoded.workspaceId !== workspaceId ||
        decoded.blobId !== blobId
      ) {
        throw new BadRequest('Invalid OnlyOffice file token.');
      }
    } catch {
      throw new BadRequest('Invalid OnlyOffice file token.');
    }
  }

  /**
   * Stream a blob's bytes + content type, for the public download endpoint.
   */
  async getBlob(workspaceId: string, blobId: string) {
    return this.blobStorage.get(workspaceId, blobId);
  }

  /**
   * Build a signed OnlyOffice editor config for a given workspace blob.
   *
   * @param documentKey a value that changes whenever the blob content changes,
   *   so OnlyOffice does not serve a stale cached version. We use the blob's
   *   last-modified + content-length hash.
   */
  async buildEditorConfig(input: {
    workspaceId: string;
    blobId: string;
    name: string;
    /** Whether the user has write permission. */
    canWrite: boolean;
    /** Requested interaction mode (already permission-resolved by caller). */
    mode: OnlyOfficeMode;
    /** Attachment instance identity (doc + block) to scope the document key. */
    docId?: string;
    blockId?: string;
    user?: { id: string; name: string };
    lang?: string;
  }): Promise<OnlyOfficeEditorConfig> {
    if (!this.enabled) {
      throw new BadRequest('OnlyOffice integration is not enabled.');
    }

    const { workspaceId, blobId, name, canWrite, mode } = input;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const documentType = getOnlyOfficeDocumentType(ext);
    if (!documentType) {
      throw new BadRequest(`Unsupported file type for OnlyOffice: .${ext}`);
    }

    // Build the document key from BOTH the content (so edits invalidate the
    // cache) AND the attachment instance (docId + blockId). The instance part
    // ensures two attachments sharing the same blob get independent editing
    // sessions/caches — otherwise editing one would leak into the other.
    const meta = await this.blobStorage.head(workspaceId, blobId);
    const keySeed = [
      workspaceId,
      input.docId ?? '',
      input.blockId ?? '',
      blobId,
      meta?.lastModified?.getTime() ?? 0,
      meta?.contentLength ?? 0,
    ].join(':');
    const documentKey = createHash('sha1').update(keySeed).digest('hex');

    // document.url points to a PUBLIC, token-authenticated download endpoint
    // because the Document Server fetches it server-side without a user session
    // (the generic /blobs route requires auth and would return 403).
    const fileToken = this.signFileToken(workspaceId, blobId);
    const fileUrl = `${this.callbackHost}/api/workspaces/${workspaceId}/onlyoffice/download/${encodeURIComponent(blobId)}?token=${encodeURIComponent(fileToken)}`;
    // Carry the attachment instance identity on the callback URL (OnlyOffice
    // calls it verbatim, preserving the query) so the callback can locate the
    // per-attachment version manifest. `:name` is the blob open at edit start.
    const cbQuery = new URLSearchParams();
    if (input.docId) cbQuery.set('docId', input.docId);
    if (input.blockId) cbQuery.set('blockId', input.blockId);
    const cbSuffix = cbQuery.toString() ? `?${cbQuery.toString()}` : '';
    const callbackUrl = `${this.callbackHost}/api/workspaces/${workspaceId}/onlyoffice/callback/${encodeURIComponent(blobId)}${cbSuffix}`;

    const m = this.resolveMode(mode, canWrite);

    const documentConfig = {
      document: {
        fileType: ext,
        key: documentKey,
        title: name,
        url: fileUrl,
        permissions: m.permissions,
      },
      documentType,
      ...(m.type ? { type: m.type } : {}),
      editorConfig: {
        mode: m.editorMode,
        // Only attach the save callback for modes that can produce changes.
        ...(m.writable ? { callbackUrl } : {}),
        lang: this.normalizeLang(input.lang),
        ...(input.user ? { user: input.user } : {}),
        // Keep OnlyOffice autosave ON so edits persist to its cache (no data
        // loss, no "unsaved" prompt). The backend COLLAPSES the resulting
        // autosave callbacks of one session onto a single live version, and
        // only the explicit forcesave on close is sealed as a history version.
        customization: {
          autosave: true,
          forcesave: false,
          compactHeader: m.type === 'embedded',
          close: { visible: true },
          ...m.customization,
        },
        ...(m.embedded ? { embedded: m.embedded } : {}),
      },
    };

    return {
      documentServerUrl: this.config.onlyoffice.documentServerUrl.replace(
        /\/$/,
        ''
      ),
      config: {
        ...documentConfig,
        token: this.sign(documentConfig),
      },
    };
  }

  /**
   * Resolve an interaction mode into concrete OnlyOffice settings. Falls back
   * to read-only when the user lacks write permission for a writable mode.
   */
  private resolveMode(mode: OnlyOfficeMode, canWrite: boolean) {
    // Modes that change content require write permission; otherwise downgrade.
    const wantsWrite = ONLYOFFICE_WRITABLE_MODES.has(mode);
    const effective: OnlyOfficeMode = wantsWrite && !canWrite ? 'view' : mode;
    const writable = ONLYOFFICE_WRITABLE_MODES.has(effective);

    // Base read-only permission set.
    const ro = {
      edit: false,
      download: true,
      print: true,
      copy: true,
      review: false,
      comment: false,
      fillForms: false,
    };

    switch (effective) {
      case 'edit':
        return {
          editorMode: 'edit' as const,
          writable,
          permissions: { ...ro, edit: true, review: true, comment: true },
        };
      case 'review':
        return {
          editorMode: 'edit' as const,
          writable,
          permissions: { ...ro, edit: false, review: true, comment: true },
          customization: { review: { trackChanges: true } },
        };
      case 'fillForms':
        return {
          editorMode: 'edit' as const,
          writable,
          permissions: { ...ro, edit: false, fillForms: true },
        };
      case 'comment':
        return {
          editorMode: 'edit' as const,
          writable,
          permissions: { ...ro, edit: false, comment: true },
        };
      case 'embedded':
        return {
          editorMode: 'view' as const,
          writable: false,
          type: 'embedded' as const,
          permissions: { ...ro },
          embedded: { toolbarDocked: 'top' },
        };
      case 'mobile':
        return {
          editorMode: (canWrite ? 'edit' : 'view') as 'edit' | 'view',
          writable: canWrite,
          type: 'mobile' as const,
          permissions: { ...ro, edit: canWrite },
        };
      case 'view':
      default:
        // Plain, fully-usable read-only: the toolbar/menu stay available so the
        // user can actually view, zoom, navigate and close. Only editing is
        // disabled. (An earlier anti-leak variant that also forbade
        // copy/print/download stripped the UI down to the point the menu was
        // unusable, so it was relaxed.)
        return {
          editorMode: 'view' as const,
          writable: false,
          permissions: { ...ro, edit: false },
        };
    }
  }

  /**
   * Map an AFFiNE UI language code (e.g. `zh-Hans`, `en`, `fr`) to the language
   * code the OnlyOffice editor expects.
   */
  private normalizeLang(lang?: string): string {
    if (!lang) {
      return 'en';
    }
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) {
      // OnlyOffice uses zh / zh-TW for Simplified / Traditional Chinese.
      return lower.includes('hant') || lower.includes('tw') ? 'zh-TW' : 'zh';
    }
    // Otherwise use the primary subtag (en-US -> en, fr-FR -> fr).
    return lower.split('-')[0];
  }

  /**
   * Build a self-contained HTML page that mounts the OnlyOffice editor.
   * Served standalone (own window/tab) so it does not couple to the AFFiNE
   * frontend framework. It fetches the signed config from the (auth'd) config
   * endpoint using the browser session cookie, then mounts DocsAPI.
   */
  buildEditorPage(input: {
    workspaceId: string;
    blobId: string;
    filename: string;
    lang?: string;
    mode?: OnlyOfficeMode;
    docId?: string;
    blockId?: string;
  }): string {
    const params = {
      workspaceId: input.workspaceId,
      blobId: input.blobId,
      filename: input.filename,
      lang: input.lang ?? '',
      mode: input.mode ?? 'edit',
      docId: input.docId ?? '',
      blockId: input.blockId ?? '',
      configBase: `${this.url.baseUrl}/api/workspaces`,
    };
    // JSON.stringify is HTML-safe here because it is placed inside a <script>
    // as a JS object literal; we additionally escape '<' to avoid </script>.
    const json = JSON.stringify(params).replace(/</g, '\\u003c');
    return ONLYOFFICE_EDITOR_HTML.replace('__PARAMS__', json);
  }

  /**
   * Verify the JWT attached to an incoming callback (header or body) and
   * return the verified payload.
   */
  verifyCallback(
    rawAuthHeader: string | undefined,
    body: OnlyOfficeCallbackBody
  ): OnlyOfficeCallbackBody {
    const secret = this.config.onlyoffice.jwtSecret;
    if (!secret) {
      throw new BadRequest('OnlyOffice jwtSecret is not configured.');
    }

    // OnlyOffice sends the token either in the Authorization header
    // ("Bearer <token>") or in the body `token` field.
    let token: string | undefined;
    if (rawAuthHeader?.startsWith('Bearer ')) {
      token = rawAuthHeader.slice('Bearer '.length);
    } else if (body.token) {
      token = body.token;
    }

    if (!token) {
      throw new BadRequest('Missing OnlyOffice callback token.');
    }

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as { payload?: OnlyOfficeCallbackBody } & OnlyOfficeCallbackBody;
      // When signed in body mode, the original payload is nested under `payload`.
      return decoded.payload ?? decoded;
    } catch (e) {
      this.logger.warn(`Invalid OnlyOffice callback token: ${e}`);
      throw new BadRequest('Invalid OnlyOffice callback token.');
    }
  }

  /**
   * Apply a verified callback: when the document is ready to save (status 2/6),
   * download the produced file and store it as a NEW content-addressed blob
   * (key = sha256(content), matching blocksuite). The original blob is left
   * untouched — AFFiNE blobs are immutable/content-addressed, so we never
   * overwrite. The new blob id + size are cached under the document key so the
   * editor page can pick them up and tell the main window to repoint the
   * attachment.
   */
  async applyCallback(
    workspaceId: string,
    blobId: string,
    payload: OnlyOfficeCallbackBody,
    instance?: { docId?: string; blockId?: string }
  ): Promise<void> {
    // 2 = ready to save, 6 = force save
    if (payload.status !== 2 && payload.status !== 6) {
      return;
    }

    const downloadUrl = payload.url;
    if (!downloadUrl) {
      throw new BadRequest('OnlyOffice callback missing document url.');
    }

    // Validate the host against the configured Document Server, then fetch the
    // URL AS-IS. We must NOT rewrite the host: OnlyOffice signs the cache URL
    // (shardkey/md5) against the original host:port, so rewriting breaks it.
    this.assertCallbackDownloadHostAllowed(downloadUrl);

    // Use a plain fetch (not the SSRF-guarded safeFetch): the target is the
    // operator-configured, trusted Document Server, and SSRF protections would
    // otherwise reject its private/loopback address.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await globalThis.fetch(downloadUrl, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new BadRequest(
        `Failed to download edited document from OnlyOffice: ${response.status}`
      );
    }

    // KNOWN BEHAVIOR: the saved file may be substantially smaller than the
    // original (e.g. a 3MB docx coming back as ~50KB). This is NOT data loss on
    // our side — we store exactly what the Document Server returns. OnlyOffice
    // re-serializes the document on save and DROPS the original embedded fonts
    // (`word/fonts/*.odttf`), keeping only the font-name references; body text,
    // images and structure are preserved. OnlyOffice has no "embed fonts on
    // save" option (its model is server-side font install + substitution), so
    // this cannot be fixed here. Only matters for pixel-exact cross-machine
    // font fidelity; for normal editing/reading the document is intact.
    const buffer = Buffer.from(await response.arrayBuffer());

    // Content-addressed key (same scheme as blocksuite `sha()`).
    const newBlobId = this.computeBlobKey(buffer);

    // Dedup: skip the write if this exact content already exists (OnlyOffice
    // sometimes fires a save with no real change). Content-addressing means an
    // identical blob has an identical key.
    const existing = await this.blobStorage.head(workspaceId, newBlobId);
    if (!existing) {
      await this.blobStorage.put(workspaceId, newBlobId, buffer);
    }

    // Cache the result keyed by the OnlyOffice document key so the editor page
    // (which knows the docKey) can fetch it and notify the main window.
    const docKey = payload.key;
    if (docKey) {
      const result: OnlyOfficeSaveResult = {
        blobId: newBlobId,
        size: buffer.length,
      };
      await this.cache.set(this.resultCacheKey(workspaceId, docKey), result, {
        // 10 min: long enough for the editor page to poll, short enough to GC.
        ttl: 10 * 60 * 1000,
      });
    }

    // Record this version. Consecutive autosaves (status 2) of the same
    // session (same docKey) collapse onto a single unsealed entry; an explicit
    // forcesave on close (status 6) seals it as a finalized history version.
    if (instance?.docId && instance?.blockId) {
      await this.recordVersion(
        workspaceId,
        instance.docId,
        instance.blockId,
        {
          blobId: newBlobId,
          size: buffer.length,
          createdAt: Date.now(),
          docKey: payload.key,
          sealed: payload.status === 6,
        },
        blobId
      );
    }

    this.logger.log(
      `OnlyOffice saved edited content as new blob ${workspaceId}/${newBlobId} ` +
        `(${buffer.length} bytes, from original ${blobId}, status ${payload.status})`
    );
  }

  // ---- Version manifest ---------------------------------------------------

  /** Fixed, path-safe blob key holding the version manifest for an attachment. */
  private manifestKey(docId: string, blockId: string): string {
    const h = createHash('sha1').update(`${docId}:${blockId}`).digest('hex');
    return `onlyoffice-manifest-${h}`;
  }

  private async readManifest(
    workspaceId: string,
    docId: string,
    blockId: string
  ): Promise<OnlyOfficeVersionManifest> {
    try {
      const { body } = await this.blobStorage.get(
        workspaceId,
        this.manifestKey(docId, blockId)
      );
      if (!body) return { versions: [] };
      const chunks: Buffer[] = [];
      for await (const c of body) {
        chunks.push(Buffer.from(c));
      }
      const parsed = JSON.parse(
        Buffer.concat(chunks).toString('utf-8')
      ) as OnlyOfficeVersionManifest;
      return parsed.versions ? parsed : { versions: [] };
    } catch {
      return { versions: [] };
    }
  }

  private async writeManifest(
    workspaceId: string,
    docId: string,
    blockId: string,
    manifest: OnlyOfficeVersionManifest
  ): Promise<void> {
    const buf = Buffer.from(JSON.stringify(manifest), 'utf-8');
    await this.blobStorage.put(
      workspaceId,
      this.manifestKey(docId, blockId),
      buf
    );
  }

  /**
   * Record a version with collapse semantics:
   *  - Seeds the manifest with the original blob (open at edit start).
   *  - Consecutive autosaves of the SAME session (matching docKey, not yet
   *    sealed) replace the live entry instead of accumulating.
   *  - A sealed version (forcesave on close) is finalized and kept.
   *  - De-duplicates by blobId.
   */
  private async recordVersion(
    workspaceId: string,
    docId: string,
    blockId: string,
    version: OnlyOfficeVersion,
    originalBlobId: string
  ): Promise<void> {
    // Serialize read-modify-write of the same manifest across ALL server
    // instances (distributed Redis mutex): concurrent status-2/6 callbacks for
    // one attachment would otherwise overwrite each other's history.
    await using lock = await this.mutex.acquire(
      `onlyoffice:manifest:${workspaceId}:${docId}:${blockId}`
    );
    if (!lock) {
      this.logger.warn(
        `Could not acquire manifest lock for ${workspaceId}/${docId}/${blockId}; skipping version record`
      );
      return;
    }
    try {
      const manifest = await this.readManifest(workspaceId, docId, blockId);

      // Seed with the original version (sealed) if the manifest is new.
      if (manifest.versions.length === 0 && originalBlobId) {
        const meta = await this.blobStorage.head(workspaceId, originalBlobId);
        manifest.versions.push({
          blobId: originalBlobId,
          size: meta?.contentLength ?? 0,
          createdAt: (meta?.lastModified?.getTime() ?? Date.now()) - 1,
          sealed: true,
        });
      }

      const last = manifest.versions[manifest.versions.length - 1];

      // Content unchanged vs. an EXISTING version (e.g. edited then undone back
      // to identical bytes): don't create a duplicate. Just seal it if this is
      // a final save, and drop a dangling live entry of the same session.
      const sameContent = manifest.versions.find(
        v => v.blobId === version.blobId
      );
      if (sameContent) {
        if (version.sealed) sameContent.sealed = true;
        // If the live (unsealed) tail of this session points elsewhere, remove
        // it — the session's real result is this already-stored version.
        if (
          last &&
          last !== sameContent &&
          !last.sealed &&
          last.docKey === version.docKey
        ) {
          const stale = last.blobId;
          manifest.versions.pop();
          if (stale !== originalBlobId) {
            await this.softDeleteBlob(workspaceId, stale);
          }
        }
        await this.writeManifest(workspaceId, docId, blockId, manifest);
        return;
      }

      // Collapse: if the last entry is the live (unsealed) working copy of the
      // same session, replace it rather than appending.
      if (
        last &&
        !last.sealed &&
        version.docKey &&
        last.docKey === version.docKey
      ) {
        const replaced = last.blobId;
        manifest.versions[manifest.versions.length - 1] = version;
        await this.writeManifest(workspaceId, docId, blockId, manifest);
        // The superseded intermediate autosave blob is now unreferenced.
        if (replaced !== version.blobId && replaced !== originalBlobId) {
          await this.softDeleteBlob(workspaceId, replaced);
        }
        return;
      }

      // Otherwise append as a new entry.
      manifest.versions.push(version);
      await this.writeManifest(workspaceId, docId, blockId, manifest);
    } catch (e) {
      this.logger.warn(`Failed to record OnlyOffice version: ${e}`);
    }
  }

  /**
   * Soft-delete a blob (frees quota, keeps the file on disk). Used for
   * superseded version blobs. Soft (not permanent) because blobs are
   * content-addressed and may be shared by other attachments/docs — physical
   * deletion must be left to a reference-safe GC. Best-effort.
   */
  private async softDeleteBlob(workspaceId: string, blobId: string) {
    try {
      await this.blobStorage.delete(workspaceId, blobId, false);
    } catch {
      // ignore
    }
  }

  /** List stored versions for an attachment, newest last. */
  async listVersions(
    workspaceId: string,
    docId: string,
    blockId: string
  ): Promise<OnlyOfficeVersion[]> {
    const manifest = await this.readManifest(workspaceId, docId, blockId);
    return manifest.versions;
  }

  /**
   * Remove a version from an attachment's manifest. Rejects blob ids that are
   * not part of THIS attachment's manifest (otherwise the endpoint could be
   * used to delete arbitrary workspace blobs). The blob is soft-deleted, not
   * physically removed, because it may be shared by other content-addressed
   * references. Requires the caller to have verified write permission.
   */
  async deleteVersion(
    workspaceId: string,
    docId: string,
    blockId: string,
    blobId: string
  ): Promise<void> {
    const manifest = await this.readManifest(workspaceId, docId, blockId);
    if (!manifest.versions.some(v => v.blobId === blobId)) {
      throw new BadRequest('Version not found for this attachment.');
    }
    manifest.versions = manifest.versions.filter(v => v.blobId !== blobId);
    await this.writeManifest(workspaceId, docId, blockId, manifest);
    await this.softDeleteBlob(workspaceId, blobId);
    this.logger.log(`OnlyOffice removed version ${workspaceId}/${blobId}`);
  }

  /** Read a previously cached save result for a document key. */
  async getSaveResult(
    workspaceId: string,
    docKey: string
  ): Promise<OnlyOfficeSaveResult | undefined> {
    return this.cache.get<OnlyOfficeSaveResult>(
      this.resultCacheKey(workspaceId, docKey)
    );
  }

  private resultCacheKey(workspaceId: string, docKey: string): string {
    return `onlyoffice:result:${workspaceId}:${docKey}`;
  }

  /** sha256 -> base64 -> base64url (with padding), matching blocksuite `sha()`. */
  private computeBlobKey(buffer: Buffer): string {
    return createHash('sha256')
      .update(buffer)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Ask the Document Server to force-save the current session immediately,
   * which triggers a status-6 callback (so we can produce the new blob while
   * the editor window is still open). Uses the JWT-protected command service.
   */
  async forceSave(docKey: string): Promise<void> {
    const base = (
      this.config.onlyoffice.internalUrl ||
      this.config.onlyoffice.documentServerUrl
    ).replace(/\/$/, '');
    const payload = { c: 'forcesave', key: docKey };
    const token = this.sign(payload, 60);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await globalThis.fetch(
        `${base}/coauthoring/CommandService.ashx`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, token }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        throw new Error(`CommandService HTTP ${res.status}`);
      }
      // OnlyOffice signals command errors in the JSON body (error !== 0).
      const data = (await res.json().catch(() => ({}))) as { error?: number };
      if (typeof data.error === 'number' && data.error !== 0) {
        throw new Error(`CommandService error ${data.error}`);
      }
    } catch (e) {
      this.logger.warn(`OnlyOffice forcesave failed: ${e}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validate the callback download URL host against the configured Document
   * Server (browser-facing or internal). Does NOT rewrite the URL — OnlyOffice
   * signs the cache URL against its original host, so it must be fetched as-is.
   */
  private assertCallbackDownloadHostAllowed(downloadUrl: string): void {
    let target: URL;
    try {
      target = new URL(downloadUrl);
    } catch {
      throw new BadRequest('Invalid OnlyOffice callback download url.');
    }

    const allowedHosts = [
      this.config.onlyoffice.documentServerUrl,
      this.config.onlyoffice.internalUrl,
    ]
      .filter(Boolean)
      .map(u => {
        try {
          return new URL(u).host;
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    if (allowedHosts.length && !allowedHosts.includes(target.host)) {
      throw new BadRequest(
        `OnlyOffice callback url host not allowed: ${target.host}`
      );
    }
  }
}
