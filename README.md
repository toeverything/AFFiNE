<h1 align="center" style="border-bottom: none">
    <b>
        <a href="https://affine.pro">AFFiNE.PRO</a><br>
    </b>
    The Next-Gen Knowledge Base to Replace Notion & Miro. 
    <br>
</h1>

<p align="center">
Planning, Sorting and Creating all Together. Open-source, Privacy-First, and Free to use.
</p>

<div align="center"> 
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-11-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->
</div>

<p align="center">
    <a href="http://affine.pro"><b>Website</b></a> •
    <a href="https://discord.com/invite/yz6tGVsf5p"><b>Discord</b></a> •
    <a href="https://twitter.com/AffineOfficial"><b>Twitter</b></a> •
    <a href="https://medium.com/@affineworkos"><b>Medium</b></a> •
    <a href="https://t.me/affineworkos"><b>Telegram</b></a>
</p>  

<p align="center"><img width="1920" alt="affine_screen" src="https://user-images.githubusercontent.com/79301703/182363099-48b479c3-dc26-4fc3-8f9b-45f9cf358f9a.png"><p/>

# Stay Up-to-Date
![952cd7a5-70fe-48ab-b74f-23981d94d2c5](https://user-images.githubusercontent.com/79301703/182365526-df074c64-cee4-45f6-b8e0-b912f17332c6.gif)

## Shape your page
![546163d6-4c39-4128-ae7f-55d59bc3b76b](https://user-images.githubusercontent.com/79301703/182365611-b0ba3690-21c0-4d9b-bfbc-0bc15da05aeb.gif)

## Plan your task
![41a7b3a4-32f2-4d18-ac6b-57d1e1fda753](https://user-images.githubusercontent.com/79301703/182366553-1f6558a7-f17b-4611-ab95-aea3ec997154.gif)

## Sort your knowledge
![c9e1ff46-cec2-411b-b89d-6727a5e6f6c3](https://user-images.githubusercontent.com/79301703/182366602-08e44d28-a031-4097-9904-52fb9b1e9e17.gif)

## Create your story
We want your data always to be yours, and we don't want to make any sacrifice to your accessibility. Your data is always local-stored first, yet we support real-time collaboration on a peer-to-peer basis. We don't think "privacy-first" is a good excuse for not supporting modern web features. 
Collaboration isn't only necessary for teams -- you may take and insert pics on your phone, then edit them on your desktop, and share them with your collaborators. 
Affine is fully built with web technologies so that consistency and accessibility are always guaranteed on Mac, Windows and Linux.  The local file system support will be available when version 0.0.1beta is released.

# Getting Started with development 
Please view the [documentation](https://affine.gitbook.io/affine/) for OS specific development instructions

# Roadmap
Coming Soon...

# Feature requests
Please go to [Feature request](https://github.com/toeverything/AFFiNE/issues).

# FAQ
Get quick help on [Telegram](https://t.me/affineworkos) and [Discord](https://discord.gg/yz6tGVsf5p) along with other developers and contributors.

Latest news and technology sharing on [Twitter](https://twitter.com/AffineOfficial), [Medium](https://medium.com/@affineworkos) and [AFFiNE Blog](https://blog.affine.pro/).


# The Philosophy of AFFiNE
Timothy Berners-Lee once taught us about the idea of the semantic web, where all the data can be interpreted in any form while the "truth" is kept. This gives our best image of an ideal knowledge base by far, that sorting of information, planning of project and goals as well as creating of knowledge can be all together. 
We have witnessed waves of paradigm shift so many times. At first, everything was noted on office-like apps or DSL like LaTeX, then we found todo-list apps and WYSIWYG markdown editors better for writing and planning. Finally, here comes Notion and Miro, who take advantage of the idea of blocks to further liberate our creativity.
It is all perfect... If there are not so many waste operations and redundant information. And, we insist that privacy first should always be given by default. 
That's why we are making AFFiNE. Some of the most important features are:
- Transformable
  - Every block can be transformed equally as a database
    - e.g. you can now set up a to-do with MarkDown in text view and edit it in kanban view.
  - Every doc can be turned into a whiteboard
    - An always good-to-read, structured docs-form page is the best for your notes, but a boundless doodle surface is better for collaboration and creativity. 
- Atomic
  - The basic element of affine are blocks, not pages.
    - Blocks can be directly reuse and synced between pages. 
  - Pages and blocks are searched and organized on the basis of connected graphs, not tree-like paths.
  - Dual-link and semantic search are fully supported.
- Collaborative and privacy-first
  - Data is always stored locally by default
  - CRDTs are applied so that peer-to-peer collaboration is possible.
  
We really appreciate the idea of Monday, airtable and notion database. They inspired what we think is right for task management. But we don't like the repeated works -- we don't want to set a todo easily with markdown but end up re-write it again in kanban or other databases. 
With AFFiNE, every block group has infinite views, for you to keep your single source of truth.

We would like to give special thanks to the innovators and pioneers who greatly inspired us:
- Quip & Notion -- that docs can be organized as blocks
- Taskade & Monday -- brillant multi-demensional tables
- Height & Linear -- beautiful task management tool

We would also like to give thanks to open-source projects that make affine possible:
- Yjs & Yrs
- React
- Rust


# Installation
Please view the [documentation](https://affine.gitbook.io/affine/) for OS specific installation instructions.
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
