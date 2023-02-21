const repoDirectory = path.join(__dirname, '..', '..', '..');
const clientAppDirectory = path.join(__dirname, '..');
const publicDistributionDirectory = path.join(clientAppDirectory, 'public');
const affineSrcDirectory = path.join(repoDirectory, 'apps', 'web');
const affineSrcOutDirectory = path.join(affineSrcDirectory, 'out');
const publicAffineOutDirectory = path.join(
  publicDistributionDirectory,
  'affine-out'
);

if (process.platform === 'win32') $.shell = 'pwsh';

/**
 * Build affine dist html
 */
cd(repoDirectory);
await $`pnpm i -r`;
await $`pnpm build`;
cd(affineSrcDirectory);
$.env.NEXT_BASE_PATH = '/affine-out';
await $`pnpm build`;
await $`pnpm export`;
await fs.remove(publicAffineOutDirectory);
await fs.move(affineSrcOutDirectory, publicAffineOutDirectory);
