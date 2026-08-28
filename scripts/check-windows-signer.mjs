import fs from 'node:fs';

const buildType = process.env.BUILD_TYPE;
const requireSigner =
  process.env.REQUIRE_SIGNER === 'true' ||
  ['beta', 'stable'].includes(buildType);
const outputPath = process.env.GITHUB_OUTPUT;

const missing = [
  'AFFINE_SIGN_CLIENT_HASH',
  'AFFINE_SIGNER_ADDR',
  'AFFINE_SIGNER_TOKEN',
  'AFFINE_SIGNER_TS_AUTH_KEY',
  'WINDOWS_SIGNER_PUBLIC_CERT_BASE64',
].filter(name => !process.env[name]);

if (missing.length === 0) {
  setOutput('signer_available', 'true');
} else {
  setOutput('signer_available', 'false');
  const message = `Missing remote Windows signer configuration: ${missing.join(', ')}.`;
  if (requireSigner) {
    fail(message);
  } else {
    console.warn(
      `::warning::${message} Windows installer executables will be skipped.`
    );
  }
}

function setOutput(name, value) {
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `${name}=${value}\n`);
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
