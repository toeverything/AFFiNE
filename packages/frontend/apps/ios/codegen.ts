import { execSync } from 'node:child_process';

import { ProjectRoot } from '@affine-tools/utils/path';
import { Package } from '@affine-tools/utils/workspace';

const iosPackage = new Package('@affine/ios');

const PackageRoot = iosPackage.path;

console.log('[*] PackageRoot', PackageRoot);

console.log('[*] graphql...');
execSync(`${PackageRoot}/apollo-codegen-chore.sh`, { stdio: 'inherit' });

console.log('[*] rust...');
execSync(
  'cargo build -p affine_mobile_native --features use-as-lib --lib --release --target aarch64-apple-ios',
  {
    stdio: 'inherit',
  }
);

execSync(
  `cargo run -p affine_mobile_native --features use-as-lib --bin uniffi-bindgen generate \
  --library ${ProjectRoot}/target/aarch64-apple-ios/release/libaffine_mobile_native.a \
  --language swift --out-dir ${PackageRoot}/App/App/uniffi`,
  { stdio: 'inherit' }
);

console.log('[+] codegen complete');
