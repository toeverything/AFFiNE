# AFFiNE

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-11-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

Workspace for AFFiNE

## Installation

```sh
# Clone the repo
git clone git@github.com:toeverything/AFFiNE.git
```

Once cloned, switch to the master branch and navigate to the folder by typing `cd AFFiNE` and then running the following commands:

```sh
# Install all project dependencies
npm i -g pnpm
pnpm i

# Start the project
pnpm start
open http://localhost:4200/
```

This project uses pnpm for package management and is built based on nx. It is recommended to install the [nx console](https://marketplace.visualstudio.com/items?itemName=nrwl.angular-console) plugin to create dependencies

**If it is development, you can add environment variables in the project directory .env.local file**

```
NODE_ENV=development
```

## Scripts

1. Create react dependency library: `pnpm run add:library`
2. Create react components: `pnpm run add:components`
3. Create a data source: `pnpm run add:datasource`
4. Unit testing: `pnpm test`
5. Compile specific components
    - `pnpm build/test/lint `project name
    - Project name reference workspace.json
6. Create react/node program: use nx console
7. If you need to use the git cz function, please install it globally first commitizen `npm install -g commitizen conventional-changelog conventional-changelog-cli`

## Examples

Have a look at [the examples to see AFFiNE in action](https://app.affine.pro/).

## Contributing

-   Generic functional components (such as ui components) are placed in `libs/components/common`
    -   components within common are not allowed to reference _components_ except utils and dependencies
    -   Common components can reference each other
-   Business components are placed in `libs/components`
-   The data source component is placed in `libs/datasource` - api request code, schema, etc. belong to the data source
    Please see [CONTRIBUTING](/docs/CONTRIBUTING.md)

## Documentation

-   [how-to-write-css-in-affine.md](/docs/how-to-write-css-in-affine.md)
-   [how-to-add-ui-component-in-affine.md](/docs/how-to-add-ui-component-in-affine.md)
-   [how-to-customize-rollup-config.md](docs/how-to-customize-rollup-config.md)
-   [how-to-auto-download-figma-assets-in-affine.md](docs/how-to-auto-download-figma-assets-in-affine.md)
-   [affine-icons-user-guide.md](docs/affine-icons-user-guide.md)

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discuss AFFiNE on GitHub](https://github.com/toeverything/AFFiNE/discussions)

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://darksky.eu.org/"><img src="https://avatars.githubusercontent.com/u/25152247?v=4?s=100" width="100px;" alt=""/><br /><sub><b>DarkSky</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=darkskygit" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=darkskygit" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/tzhangchi"><img src="https://avatars.githubusercontent.com/u/5910926?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Chi Zhang</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=tzhangchi" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=tzhangchi" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/alt1o"><img src="https://avatars.githubusercontent.com/u/21084335?v=4?s=100" width="100px;" alt=""/><br /><sub><b>alt1o</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=alt1o" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=alt1o" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/DiamondThree"><img src="https://avatars.githubusercontent.com/u/24630517?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Diamond</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=DiamondThree" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=DiamondThree" title="Documentation">📖</a></td>
    <td align="center"><a href="https://lawvs.github.io/profile/"><img src="https://avatars.githubusercontent.com/u/18554747?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Whitewater</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=lawvs" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=lawvs" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/zuoxiaodong0815"><img src="https://avatars.githubusercontent.com/u/53252747?v=4?s=100" width="100px;" alt=""/><br /><sub><b>zuoxiaodong0815</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=zuoxiaodong0815" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=zuoxiaodong0815" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/SaikaSakura"><img src="https://avatars.githubusercontent.com/u/11530942?v=4?s=100" width="100px;" alt=""/><br /><sub><b>SaikaSakura</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=SaikaSakura" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=SaikaSakura" title="Documentation">📖</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/QiShaoXuan"><img src="https://avatars.githubusercontent.com/u/22772830?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Qi</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=QiShaoXuan" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=QiShaoXuan" title="Documentation">📖</a></td>
    <td align="center"><a href="https://tuluffy.github.io/angular.github.io/"><img src="https://avatars.githubusercontent.com/u/26808339?v=4?s=100" width="100px;" alt=""/><br /><sub><b>tuluffy</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=tuluffy" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=tuluffy" title="Documentation">📖</a></td>
    <td align="center"><a href="https://shockwave.me/"><img src="https://avatars.githubusercontent.com/u/15013925?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Austaras</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=Austaras" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=Austaras" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/uptonking?tab=repositories&type=source"><img src="https://avatars.githubusercontent.com/u/11391549?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jin Yao</b></sub></a><br /><a href="https://github.com/toeverything/AFFiNE/commits?author=uptonking" title="Code">💻</a> <a href="https://github.com/toeverything/AFFiNE/commits?author=uptonking" title="Documentation">📖</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

AFFiNE is distributed under the terms of MIT license.

See LICENSE for details.
