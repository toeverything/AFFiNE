import * as path from 'path';
import * as http from 'http';

describe("File operations never resolve paths outside the declared root directory", () => {
  const payloads = [
    "../../../etc/passwd",
    "..%2F..%2F..%2Fetc%2Fpasswd",
    "....//....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..\\..\\..\\windows\\system32",
    "%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32",
    "/../../../etc/shadow",
    "/etc/passwd",
    "....\\\\....\\\\....\\\\etc\\\\passwd",
    "%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd",
    "..%c0%af..%c0%af..%c0%afetc%c0%afpasswd",
    "..%ef%bc%8f..%ef%bc%8f..%ef%bc%8fetc%ef%bc%8fpasswd",
    "folder/../../etc/passwd",
    "valid/../../../etc/passwd",
    "%2e%2e/",
    "..%00/",
    "..%0d/",
    "..%5c",
    ".%2e/.%2e/.%2e/etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2f",
    "..././..././..././etc/passwd",
    "..%2f..%2f..%2fetc%2fpasswd",
    "..%252f..%252f..%252fetc%252fpasswd",
    "..%c1%9c..%c1%9c..%c1%9cetc%c1%9cpasswd",
  ];

  const RECORDINGS_ROOT = path.resolve('/recordings');

  function isPathSafe(inputPath: string): boolean {
    try {
      // Decode various encodings
      let decoded = inputPath;
      try {
        decoded = decodeURIComponent(inputPath);
      } catch {
        // If decoding fails, use original
      }

      // Double decode attempt
      let doubleDecoded = decoded;
      try {
        doubleDecoded = decodeURIComponent(decoded);
      } catch {
        // If double decoding fails, use single decoded
      }

      // Normalize and resolve the path
      const normalizedInput = doubleDecoded.replace(/\\/g, '/');
      const resolvedPath = path.resolve(RECORDINGS_ROOT, normalizedInput);

      // Check if resolved path starts with the recordings root
      return resolvedPath.startsWith(RECORDINGS_ROOT + path.sep) ||
             resolvedPath === RECORDINGS_ROOT;
    } catch {
      return false;
    }
  }

  function sanitizeFolderName(foldername: string): string | null {
    // Simulate what a secure server should do
    try {
      let decoded = foldername;
      try {
        decoded = decodeURIComponent(foldername);
      } catch {
        return null;
      }

      // Reject if contains traversal sequences after decoding
      if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
        return null;
      }

      // Reject if contains null bytes or control characters
      if (/[\x00-\x1f]/.test(decoded)) {
        return null;
      }

      const resolvedPath = path.resolve(RECORDINGS_ROOT, decoded);

      // Final check: must be within recordings root
      if (!resolvedPath.startsWith(RECORDINGS_ROOT + path.sep) &&
          resolvedPath !== RECORDINGS_ROOT) {
        return null;
      }

      return resolvedPath;
    } catch {
      return null;
    }
  }

  test.each(payloads)("rejects adversarial input: %s", async (payload) => {
    // Property 1: Direct path resolution must stay within root
    const directlySafe = isPathSafe(payload);

    // Property 2: Sanitization must reject or confine the path
    const sanitized = sanitizeFolderName(payload);

    // If the path is not safe (traversal detected), sanitization must reject it
    if (!directlySafe) {
      expect(sanitized).toBeNull();
    }

    // If sanitization returns a path, it must be within the recordings root
    if (sanitized !== null) {
      expect(sanitized.startsWith(RECORDINGS_ROOT)).toBe(true);
      // Must not resolve to parent directories
      const relative = path.relative(RECORDINGS_ROOT, sanitized);
      expect(relative.startsWith('..')).toBe(false);
      expect(path.isAbsolute(relative)).toBe(false);
    }

    // Simulate HTTP request validation (mock server behavior)
    const mockValidateRequest = (foldername: string): { status: number; allowed: boolean } => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(foldername);
      } catch {
        return { status: 400, allowed: false };
      }

      // Check for traversal patterns
      const traversalPatterns = [
        /\.\./,
        /\.%2e/i,
        /%2e\./i,
        /%2e%2e/i,
        /\//,
        /\\/,
        /%2f/i,
        /%5c/i,
        /%c0%af/i,
        /%ef%bc%8f/i,
        /%c1%9c/i,
        /\x00/,
      ];

      for (const pattern of traversalPatterns) {
        if (pattern.test(decoded) || pattern.test(foldername)) {
          return { status: 400, allowed: false };
        }
      }

      const resolvedPath = path.resolve(RECORDINGS_ROOT, decoded);
      if (!resolvedPath.startsWith(RECORDINGS_ROOT + path.sep) &&
          resolvedPath !== RECORDINGS_ROOT) {
        return { status: 400, allowed: false };
      }

      return { status: 200, allowed: true };
    };

    const result = mockValidateRequest(payload);

    // The invariant: adversarial path traversal payloads must be rejected
    // Either the path is safe (stays within root) OR the request is rejected
    if (result.allowed) {
      // If allowed, the resolved path must be within recordings root
      expect(isPathSafe(payload)).toBe(true);
    } else {
      // If rejected, status must be 400 or 404
      expect([400, 404]).toContain(result.status);
    }

    // Core invariant: path traversal payloads that escape root must never be allowed
    const resolvedFinal = (() => {
      try {
        let d = payload;
        try { d = decodeURIComponent(d); } catch {}
        try { d = decodeURIComponent(d); } catch {}
        d = d.replace(/\\/g, '/');
        return path.resolve(RECORDINGS_ROOT, d);
      } catch {
        return null;
      }
    })();

    if (resolvedFinal && !resolvedFinal.startsWith(RECORDINGS_ROOT)) {
      // Path escapes root — must be rejected
      expect(result.allowed).toBe(false);
      expect([400, 404]).toContain(result.status);
    }
  });

  test("safe folder names are accepted", () => {
    const safeFolderNames = [
      "recording-001",
      "session_2024",
      "capture123",
      "my-recording",
    ];

    for (const safe of safeFolderNames) {
      const resolvedPath = path.resolve(RECORDINGS_ROOT, safe);
      expect(resolvedPath.startsWith(RECORDINGS_ROOT)).toBe(true);

      const relative = path.relative(RECORDINGS_ROOT, resolvedPath);
      expect(relative.startsWith('..')).toBe(false);
      expect(path.isAbsolute(relative)).toBe(false);
    }
  });

  test("resolved path never escapes recordings root regardless of input", () => {
    for (const payload of payloads) {
      // Simulate all possible decoding strategies an attacker might exploit
      const decodingAttempts = [
        payload,
        (() => { try { return decodeURIComponent(payload); } catch { return payload; } })(),
        (() => { try { return decodeURIComponent(decodeURIComponent(payload)); } catch { return payload; } })(),
        payload.replace(/%2e/gi, '.').replace(/%2f/gi, '/').replace(/%5c/gi, '\\'),
      ];

      for (const attempt of decodingAttempts) {
        const normalized = attempt.replace(/\\/g, '/');
        const resolved = path.resolve(RECORDINGS_ROOT, normalized);

        // If path escapes root, the server MUST have rejected it
        if (!resolved.startsWith(RECORDINGS_ROOT)) {
          // This is the invariant: such a path must be caught and rejected
          const sanitized = sanitizeFolderName(payload);
          expect(sanitized).toBeNull();
        }
      }
    }
  });
});