# AFFiNE Monorepo Cli

## Start

```bash
yarn affine -h
```

### Run build command defined in package.json

```bash
yarn affine i18n build
# or
yarn build -p i18n
```

### Run dev command defined in package.json

```bash
yarn affine web dev
# or
yarn dev -p i18n
```

### Clean

```bash
yarn affine clean --dist --rust
# clean node_modules
yarn affine clean --node-modules
```

### Init

> Generate files that make the monorepo work properly, the per project codegen will not be included anymore

```bash
yarn affine init
```

## Tricks

### Define scripts to run a .ts files without `--loader ts-node/esm/transpile-only`

`affine run` will automatically inject `ts-node`'s transpile service(swc used) for your scripts

```json
{
  "name": "@affine/demo",
  "scripts": {
    "dev": "node ./dev.ts"
  }
}
```

```bash
affine @affine/demo dev
```

or

```json
{
  "name": "@affine/demo",
  "scripts": {
    "dev": "r ./src/index.ts"
  },
  "devDependencies": {
    "@affine-tools/cli": "workspace:*"
  }
}
```

### Short your key presses

```bash
# af is also available for running the scripts
yarn af web build
```

#### by custom shell script

> personally, I use 'af'

create file `af` in the root of AFFiNE project with the following content

```bash
#!/usr/bin/env sh
./tools/scripts/bin/runner.js affine.ts $@
```

or on windows:

```cmd
node "./tools/cli/bin/runner.js" affine.ts %*
```

and give it executable permission

```bash
chmod a+x ./af

# now you can run scripts with simply
./af web build
```

if you want to go further, but for vscode(or other forks) only, add the following to your `.vscode/settings.json`

```json
{
  "terminal.integrated.env.osx": {
    "PATH": "${env:PATH}:${cwd}"
  },
  "terminal.integrated.env.linux": {
    "PATH": "${env:PATH}:${cwd}"
  },
  "terminal.integrated.env.windows": {
    "PATH": "${env:PATH};${cwd}"
  }
}
```

restart all the integrated terminals and now you get:

```bash
af web build
```

```

```
