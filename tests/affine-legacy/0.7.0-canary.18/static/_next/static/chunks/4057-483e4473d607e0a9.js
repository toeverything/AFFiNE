(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [4057],
  {
    464: function (e, t, n) {
      'use strict';
      n.d(t, {
        FP: function () {
          return Y;
        },
        tc: function () {
          return m;
        },
      });
      var r,
        s,
        a,
        i,
        o,
        l,
        c,
        u,
        h,
        p,
        d = n(28873),
        f = n(91126),
        g = n(34406);
      let m = [
        {
          id: 'abap',
          scopeName: 'source.abap',
          path: 'abap.tmLanguage.json',
          samplePath: 'abap.sample',
        },
        {
          id: 'actionscript-3',
          scopeName: 'source.actionscript.3',
          path: 'actionscript-3.tmLanguage.json',
          samplePath: 'actionscript-3.sample',
        },
        {
          id: 'ada',
          scopeName: 'source.ada',
          path: 'ada.tmLanguage.json',
          samplePath: 'ada.sample',
        },
        {
          id: 'apache',
          scopeName: 'source.apacheconf',
          path: 'apache.tmLanguage.json',
        },
        {
          id: 'apex',
          scopeName: 'source.apex',
          path: 'apex.tmLanguage.json',
          samplePath: 'apex.sample',
        },
        {
          id: 'apl',
          scopeName: 'source.apl',
          path: 'apl.tmLanguage.json',
          embeddedLangs: ['html', 'xml', 'css', 'javascript', 'json'],
        },
        {
          id: 'applescript',
          scopeName: 'source.applescript',
          path: 'applescript.tmLanguage.json',
          samplePath: 'applescript.sample',
        },
        {
          id: 'ara',
          scopeName: 'source.ara',
          path: 'ara.tmLanguage.json',
          samplePath: 'ara.sample',
        },
        {
          id: 'asm',
          scopeName: 'source.asm.x86_64',
          path: 'asm.tmLanguage.json',
          samplePath: 'asm.sample',
        },
        {
          id: 'astro',
          scopeName: 'source.astro',
          path: 'astro.tmLanguage.json',
          samplePath: 'astro.sample',
          embeddedLangs: [
            'json',
            'javascript',
            'typescript',
            'stylus',
            'sass',
            'css',
            'scss',
            'less',
            'postcss',
            'tsx',
          ],
        },
        {
          id: 'awk',
          scopeName: 'source.awk',
          path: 'awk.tmLanguage.json',
          samplePath: 'awk.sample',
        },
        {
          id: 'ballerina',
          scopeName: 'source.ballerina',
          path: 'ballerina.tmLanguage.json',
          samplePath: 'ballerina.sample',
        },
        {
          id: 'bat',
          scopeName: 'source.batchfile',
          path: 'bat.tmLanguage.json',
          samplePath: 'bat.sample',
          aliases: ['batch'],
        },
        {
          id: 'berry',
          scopeName: 'source.berry',
          path: 'berry.tmLanguage.json',
          samplePath: 'berry.sample',
          aliases: ['be'],
        },
        {
          id: 'bibtex',
          scopeName: 'text.bibtex',
          path: 'bibtex.tmLanguage.json',
        },
        {
          id: 'bicep',
          scopeName: 'source.bicep',
          path: 'bicep.tmLanguage.json',
          samplePath: 'bicep.sample',
        },
        {
          id: 'blade',
          scopeName: 'text.html.php.blade',
          path: 'blade.tmLanguage.json',
          samplePath: 'blade.sample',
          embeddedLangs: ['html', 'xml', 'sql', 'javascript', 'json', 'css'],
        },
        {
          id: 'c',
          scopeName: 'source.c',
          path: 'c.tmLanguage.json',
          samplePath: 'c.sample',
        },
        {
          id: 'cadence',
          scopeName: 'source.cadence',
          path: 'cadence.tmLanguage.json',
          samplePath: 'cadence.sample',
          aliases: ['cdc'],
        },
        {
          id: 'clarity',
          scopeName: 'source.clar',
          path: 'clarity.tmLanguage.json',
          samplePath: 'clarity.sample',
        },
        {
          id: 'clojure',
          scopeName: 'source.clojure',
          path: 'clojure.tmLanguage.json',
          samplePath: 'clojure.sample',
          aliases: ['clj'],
        },
        {
          id: 'cmake',
          scopeName: 'source.cmake',
          path: 'cmake.tmLanguage.json',
          samplePath: 'cmake.sample',
        },
        {
          id: 'cobol',
          scopeName: 'source.cobol',
          path: 'cobol.tmLanguage.json',
          samplePath: 'cobol.sample',
          embeddedLangs: ['sql', 'html', 'java'],
        },
        {
          id: 'codeql',
          scopeName: 'source.ql',
          path: 'codeql.tmLanguage.json',
          samplePath: 'codeql.sample',
          aliases: ['ql'],
          embeddedLangs: ['markdown'],
        },
        {
          id: 'coffee',
          scopeName: 'source.coffee',
          path: 'coffee.tmLanguage.json',
          samplePath: 'coffee.sample',
          embeddedLangs: ['javascript'],
        },
        {
          id: 'cpp',
          scopeName: 'source.cpp',
          path: 'cpp.tmLanguage.json',
          samplePath: 'cpp.sample',
          embeddedLangs: ['glsl', 'sql'],
        },
        {
          id: 'crystal',
          scopeName: 'source.crystal',
          path: 'crystal.tmLanguage.json',
          samplePath: 'crystal.sample',
          embeddedLangs: [
            'html',
            'sql',
            'css',
            'c',
            'javascript',
            'shellscript',
          ],
        },
        {
          id: 'csharp',
          scopeName: 'source.cs',
          path: 'csharp.tmLanguage.json',
          samplePath: 'csharp.sample',
          aliases: ['c#', 'cs'],
        },
        {
          id: 'css',
          scopeName: 'source.css',
          path: 'css.tmLanguage.json',
          samplePath: 'css.sample',
        },
        {
          id: 'cue',
          scopeName: 'source.cue',
          path: 'cue.tmLanguage.json',
          samplePath: 'cue.sample',
        },
        {
          id: 'd',
          scopeName: 'source.d',
          path: 'd.tmLanguage.json',
          samplePath: 'd.sample',
        },
        {
          id: 'dart',
          scopeName: 'source.dart',
          path: 'dart.tmLanguage.json',
          samplePath: 'dart.sample',
        },
        {
          id: 'dax',
          scopeName: 'source.dax',
          path: 'dax.tmLanguage.json',
          samplePath: 'dax.sample',
        },
        {
          id: 'diff',
          scopeName: 'source.diff',
          path: 'diff.tmLanguage.json',
          samplePath: 'diff.sample',
        },
        {
          id: 'docker',
          scopeName: 'source.dockerfile',
          path: 'docker.tmLanguage.json',
          samplePath: 'docker.sample',
          aliases: ['dockerfile'],
        },
        {
          id: 'dream-maker',
          scopeName: 'source.dm',
          path: 'dream-maker.tmLanguage.json',
        },
        {
          id: 'elixir',
          scopeName: 'source.elixir',
          path: 'elixir.tmLanguage.json',
          samplePath: 'elixir.sample',
          embeddedLangs: ['html'],
        },
        {
          id: 'elm',
          scopeName: 'source.elm',
          path: 'elm.tmLanguage.json',
          samplePath: 'elm.sample',
          embeddedLangs: ['glsl'],
        },
        {
          id: 'erb',
          scopeName: 'text.html.erb',
          path: 'erb.tmLanguage.json',
          samplePath: 'erb.sample',
          embeddedLangs: ['html', 'ruby'],
        },
        {
          id: 'erlang',
          scopeName: 'source.erlang',
          path: 'erlang.tmLanguage.json',
          samplePath: 'erlang.sample',
          aliases: ['erl'],
        },
        {
          id: 'fish',
          scopeName: 'source.fish',
          path: 'fish.tmLanguage.json',
          samplePath: 'fish.sample',
        },
        {
          id: 'fsharp',
          scopeName: 'source.fsharp',
          path: 'fsharp.tmLanguage.json',
          samplePath: 'fsharp.sample',
          aliases: ['f#', 'fs'],
          embeddedLangs: ['markdown'],
        },
        {
          id: 'gdresource',
          scopeName: 'source.gdresource',
          path: 'gdresource.tmLanguage.json',
          samplePath: 'gdresource.sample',
          embeddedLangs: ['gdshader', 'gdscript'],
        },
        {
          id: 'gdscript',
          scopeName: 'source.gdscript',
          path: 'gdscript.tmLanguage.json',
          samplePath: 'gdscript.sample',
        },
        {
          id: 'gdshader',
          scopeName: 'source.gdshader',
          path: 'gdshader.tmLanguage.json',
          samplePath: 'gdshader.sample',
        },
        {
          id: 'gherkin',
          scopeName: 'text.gherkin.feature',
          path: 'gherkin.tmLanguage.json',
        },
        {
          id: 'git-commit',
          scopeName: 'text.git-commit',
          path: 'git-commit.tmLanguage.json',
          embeddedLangs: ['diff'],
        },
        {
          id: 'git-rebase',
          scopeName: 'text.git-rebase',
          path: 'git-rebase.tmLanguage.json',
          embeddedLangs: ['shellscript'],
        },
        {
          id: 'glsl',
          scopeName: 'source.glsl',
          path: 'glsl.tmLanguage.json',
          samplePath: 'glsl.sample',
          embeddedLangs: ['c'],
        },
        {
          id: 'gnuplot',
          scopeName: 'source.gnuplot',
          path: 'gnuplot.tmLanguage.json',
        },
        {
          id: 'go',
          scopeName: 'source.go',
          path: 'go.tmLanguage.json',
          samplePath: 'go.sample',
        },
        {
          id: 'graphql',
          scopeName: 'source.graphql',
          path: 'graphql.tmLanguage.json',
          embeddedLangs: ['javascript', 'typescript', 'jsx', 'tsx'],
        },
        {
          id: 'groovy',
          scopeName: 'source.groovy',
          path: 'groovy.tmLanguage.json',
        },
        {
          id: 'hack',
          scopeName: 'source.hack',
          path: 'hack.tmLanguage.json',
          embeddedLangs: ['html', 'sql'],
        },
        {
          id: 'haml',
          scopeName: 'text.haml',
          path: 'haml.tmLanguage.json',
          embeddedLangs: [
            'ruby',
            'javascript',
            'sass',
            'coffee',
            'markdown',
            'css',
          ],
        },
        {
          id: 'handlebars',
          scopeName: 'text.html.handlebars',
          path: 'handlebars.tmLanguage.json',
          aliases: ['hbs'],
          embeddedLangs: ['html', 'css', 'javascript', 'yaml'],
        },
        {
          id: 'haskell',
          scopeName: 'source.haskell',
          path: 'haskell.tmLanguage.json',
          aliases: ['hs'],
        },
        {
          id: 'hcl',
          scopeName: 'source.hcl',
          path: 'hcl.tmLanguage.json',
          samplePath: 'hcl.sample',
        },
        { id: 'hlsl', scopeName: 'source.hlsl', path: 'hlsl.tmLanguage.json' },
        {
          id: 'html',
          scopeName: 'text.html.basic',
          path: 'html.tmLanguage.json',
          samplePath: 'html.sample',
          embeddedLangs: ['javascript', 'css'],
        },
        {
          id: 'http',
          scopeName: 'source.http',
          path: 'http.tmLanguage.json',
          samplePath: 'http.sample',
          embeddedLangs: ['shellscript', 'json', 'xml', 'graphql'],
        },
        {
          id: 'imba',
          scopeName: 'source.imba',
          path: 'imba.tmLanguage.json',
          samplePath: 'imba.sample',
        },
        {
          id: 'ini',
          scopeName: 'source.ini',
          path: 'ini.tmLanguage.json',
          aliases: ['properties'],
        },
        {
          id: 'java',
          scopeName: 'source.java',
          path: 'java.tmLanguage.json',
          samplePath: 'java.sample',
        },
        {
          id: 'javascript',
          scopeName: 'source.js',
          path: 'javascript.tmLanguage.json',
          samplePath: 'javascript.sample',
          aliases: ['js'],
        },
        {
          id: 'jinja-html',
          scopeName: 'text.html.jinja',
          path: 'jinja-html.tmLanguage.json',
          embeddedLangs: ['html'],
        },
        {
          id: 'jison',
          scopeName: 'source.jison',
          path: 'jison.tmLanguage.json',
          samplePath: 'jison.sample',
          embeddedLangs: ['javascript'],
        },
        { id: 'json', scopeName: 'source.json', path: 'json.tmLanguage.json' },
        {
          id: 'json5',
          scopeName: 'source.json5',
          path: 'json5.tmLanguage.json',
          samplePath: 'json5.sample',
        },
        {
          id: 'jsonc',
          scopeName: 'source.json.comments',
          path: 'jsonc.tmLanguage.json',
        },
        {
          id: 'jsonnet',
          scopeName: 'source.jsonnet',
          path: 'jsonnet.tmLanguage.json',
        },
        {
          id: 'jssm',
          scopeName: 'source.jssm',
          path: 'jssm.tmLanguage.json',
          samplePath: 'jssm.sample',
          aliases: ['fsl'],
        },
        { id: 'jsx', scopeName: 'source.js.jsx', path: 'jsx.tmLanguage.json' },
        {
          id: 'julia',
          scopeName: 'source.julia',
          path: 'julia.tmLanguage.json',
          embeddedLangs: ['cpp', 'python', 'javascript', 'r', 'sql'],
        },
        {
          id: 'kotlin',
          scopeName: 'source.kotlin',
          path: 'kotlin.tmLanguage.json',
          samplePath: 'kotlin.sample',
        },
        {
          id: 'kusto',
          scopeName: 'source.kusto',
          path: 'kusto.tmLanguage.json',
          samplePath: 'kusto.sample',
          aliases: ['kql'],
        },
        {
          id: 'latex',
          scopeName: 'text.tex.latex',
          path: 'latex.tmLanguage.json',
          embeddedLangs: [
            'tex',
            'css',
            'haskell',
            'html',
            'xml',
            'java',
            'lua',
            'julia',
            'ruby',
            'javascript',
            'typescript',
            'python',
            'yaml',
            'rust',
            'scala',
            'gnuplot',
          ],
        },
        {
          id: 'less',
          scopeName: 'source.css.less',
          path: 'less.tmLanguage.json',
          embeddedLangs: ['css'],
        },
        {
          id: 'liquid',
          scopeName: 'text.html.liquid',
          path: 'liquid.tmLanguage.json',
          samplePath: 'liquid.sample',
          embeddedLangs: ['html', 'css', 'json', 'javascript'],
        },
        { id: 'lisp', scopeName: 'source.lisp', path: 'lisp.tmLanguage.json' },
        { id: 'logo', scopeName: 'source.logo', path: 'logo.tmLanguage.json' },
        {
          id: 'lua',
          scopeName: 'source.lua',
          path: 'lua.tmLanguage.json',
          embeddedLangs: ['c'],
        },
        {
          id: 'make',
          scopeName: 'source.makefile',
          path: 'make.tmLanguage.json',
          aliases: ['makefile'],
        },
        {
          id: 'markdown',
          scopeName: 'text.html.markdown',
          path: 'markdown.tmLanguage.json',
          aliases: ['md'],
          embeddedLangs: [
            'css',
            'html',
            'ini',
            'java',
            'lua',
            'make',
            'perl',
            'r',
            'ruby',
            'php',
            'sql',
            'vb',
            'xml',
            'xsl',
            'yaml',
            'bat',
            'clojure',
            'coffee',
            'c',
            'cpp',
            'diff',
            'docker',
            'git-commit',
            'git-rebase',
            'go',
            'groovy',
            'pug',
            'javascript',
            'json',
            'jsonc',
            'less',
            'objective-c',
            'swift',
            'scss',
            'raku',
            'powershell',
            'python',
            'julia',
            'rust',
            'scala',
            'shellscript',
            'typescript',
            'tsx',
            'csharp',
            'fsharp',
            'dart',
            'handlebars',
            'erlang',
            'elixir',
            'latex',
            'bibtex',
          ],
        },
        {
          id: 'marko',
          scopeName: 'text.marko',
          path: 'marko.tmLanguage.json',
          embeddedLangs: ['css', 'less', 'scss', 'javascript'],
        },
        {
          id: 'matlab',
          scopeName: 'source.matlab',
          path: 'matlab.tmLanguage.json',
        },
        {
          id: 'mdx',
          scopeName: 'source.mdx',
          path: 'mdx.tmLanguage.json',
          embeddedLangs: [
            'tsx',
            'toml',
            'yaml',
            'c',
            'clojure',
            'coffee',
            'cpp',
            'csharp',
            'css',
            'diff',
            'docker',
            'elixir',
            'elm',
            'erlang',
            'go',
            'graphql',
            'haskell',
            'html',
            'ini',
            'java',
            'javascript',
            'json',
            'julia',
            'kotlin',
            'less',
            'lua',
            'make',
            'markdown',
            'objective-c',
            'perl',
            'python',
            'r',
            'ruby',
            'rust',
            'scala',
            'scss',
            'shellscript',
            'sql',
            'xml',
            'swift',
            'typescript',
          ],
        },
        {
          id: 'mermaid',
          scopeName: 'source.mermaid',
          path: 'mermaid.tmLanguage.json',
        },
        {
          id: 'nginx',
          scopeName: 'source.nginx',
          path: 'nginx.tmLanguage.json',
          embeddedLangs: ['lua'],
        },
        {
          id: 'nim',
          scopeName: 'source.nim',
          path: 'nim.tmLanguage.json',
          embeddedLangs: [
            'c',
            'html',
            'xml',
            'javascript',
            'css',
            'glsl',
            'markdown',
          ],
        },
        { id: 'nix', scopeName: 'source.nix', path: 'nix.tmLanguage.json' },
        {
          id: 'objective-c',
          scopeName: 'source.objc',
          path: 'objective-c.tmLanguage.json',
          aliases: ['objc'],
        },
        {
          id: 'objective-cpp',
          scopeName: 'source.objcpp',
          path: 'objective-cpp.tmLanguage.json',
        },
        {
          id: 'ocaml',
          scopeName: 'source.ocaml',
          path: 'ocaml.tmLanguage.json',
        },
        {
          id: 'pascal',
          scopeName: 'source.pascal',
          path: 'pascal.tmLanguage.json',
        },
        {
          id: 'perl',
          scopeName: 'source.perl',
          path: 'perl.tmLanguage.json',
          embeddedLangs: ['html', 'xml', 'css', 'javascript', 'sql'],
        },
        {
          id: 'php',
          scopeName: 'source.php',
          path: 'php.tmLanguage.json',
          embeddedLangs: ['html', 'xml', 'sql', 'javascript', 'json', 'css'],
        },
        {
          id: 'plsql',
          scopeName: 'source.plsql.oracle',
          path: 'plsql.tmLanguage.json',
        },
        {
          id: 'postcss',
          scopeName: 'source.css.postcss',
          path: 'postcss.tmLanguage.json',
        },
        {
          id: 'powerquery',
          scopeName: 'source.powerquery',
          path: 'powerquery.tmLanguage.json',
          samplePath: 'powerquery.sample',
        },
        {
          id: 'powershell',
          scopeName: 'source.powershell',
          path: 'powershell.tmLanguage.json',
          aliases: ['ps', 'ps1'],
        },
        {
          id: 'prisma',
          scopeName: 'source.prisma',
          path: 'prisma.tmLanguage.json',
          samplePath: 'prisma.sample',
        },
        {
          id: 'prolog',
          scopeName: 'source.prolog',
          path: 'prolog.tmLanguage.json',
        },
        {
          id: 'proto',
          scopeName: 'source.proto',
          path: 'proto.tmLanguage.json',
          samplePath: 'proto.sample',
        },
        {
          id: 'pug',
          scopeName: 'text.pug',
          path: 'pug.tmLanguage.json',
          aliases: ['jade'],
          embeddedLangs: [
            'javascript',
            'css',
            'sass',
            'scss',
            'stylus',
            'coffee',
            'html',
          ],
        },
        {
          id: 'puppet',
          scopeName: 'source.puppet',
          path: 'puppet.tmLanguage.json',
        },
        {
          id: 'purescript',
          scopeName: 'source.purescript',
          path: 'purescript.tmLanguage.json',
        },
        {
          id: 'python',
          scopeName: 'source.python',
          path: 'python.tmLanguage.json',
          samplePath: 'python.sample',
          aliases: ['py'],
        },
        { id: 'r', scopeName: 'source.r', path: 'r.tmLanguage.json' },
        {
          id: 'raku',
          scopeName: 'source.perl.6',
          path: 'raku.tmLanguage.json',
          aliases: ['perl6'],
        },
        {
          id: 'razor',
          scopeName: 'text.aspnetcorerazor',
          path: 'razor.tmLanguage.json',
          embeddedLangs: ['html', 'csharp'],
        },
        {
          id: 'reg',
          scopeName: 'source.reg',
          path: 'reg.tmLanguage.json',
          samplePath: 'reg.sample',
        },
        {
          id: 'rel',
          scopeName: 'source.rel',
          path: 'rel.tmLanguage.json',
          samplePath: 'rel.sample',
        },
        {
          id: 'riscv',
          scopeName: 'source.riscv',
          path: 'riscv.tmLanguage.json',
        },
        {
          id: 'rst',
          scopeName: 'source.rst',
          path: 'rst.tmLanguage.json',
          embeddedLangs: [
            'cpp',
            'python',
            'javascript',
            'shellscript',
            'yaml',
            'cmake',
            'ruby',
          ],
        },
        {
          id: 'ruby',
          scopeName: 'source.ruby',
          path: 'ruby.tmLanguage.json',
          samplePath: 'ruby.sample',
          aliases: ['rb'],
          embeddedLangs: [
            'html',
            'xml',
            'sql',
            'css',
            'c',
            'javascript',
            'shellscript',
            'lua',
          ],
        },
        {
          id: 'rust',
          scopeName: 'source.rust',
          path: 'rust.tmLanguage.json',
          aliases: ['rs'],
        },
        {
          id: 'sas',
          scopeName: 'source.sas',
          path: 'sas.tmLanguage.json',
          embeddedLangs: ['sql'],
        },
        { id: 'sass', scopeName: 'source.sass', path: 'sass.tmLanguage.json' },
        {
          id: 'scala',
          scopeName: 'source.scala',
          path: 'scala.tmLanguage.json',
        },
        {
          id: 'scheme',
          scopeName: 'source.scheme',
          path: 'scheme.tmLanguage.json',
        },
        {
          id: 'scss',
          scopeName: 'source.css.scss',
          path: 'scss.tmLanguage.json',
          embeddedLangs: ['css'],
        },
        {
          id: 'shaderlab',
          scopeName: 'source.shaderlab',
          path: 'shaderlab.tmLanguage.json',
          aliases: ['shader'],
          embeddedLangs: ['hlsl'],
        },
        {
          id: 'shellscript',
          scopeName: 'source.shell',
          path: 'shellscript.tmLanguage.json',
          aliases: ['bash', 'console', 'sh', 'shell', 'zsh'],
        },
        {
          id: 'smalltalk',
          scopeName: 'source.smalltalk',
          path: 'smalltalk.tmLanguage.json',
        },
        {
          id: 'solidity',
          scopeName: 'source.solidity',
          path: 'solidity.tmLanguage.json',
        },
        {
          id: 'sparql',
          scopeName: 'source.sparql',
          path: 'sparql.tmLanguage.json',
          samplePath: 'sparql.sample',
          embeddedLangs: ['turtle'],
        },
        { id: 'sql', scopeName: 'source.sql', path: 'sql.tmLanguage.json' },
        {
          id: 'ssh-config',
          scopeName: 'source.ssh-config',
          path: 'ssh-config.tmLanguage.json',
        },
        {
          id: 'stata',
          scopeName: 'source.stata',
          path: 'stata.tmLanguage.json',
          samplePath: 'stata.sample',
          embeddedLangs: ['sql'],
        },
        {
          id: 'stylus',
          scopeName: 'source.stylus',
          path: 'stylus.tmLanguage.json',
          aliases: ['styl'],
        },
        {
          id: 'svelte',
          scopeName: 'source.svelte',
          path: 'svelte.tmLanguage.json',
          embeddedLangs: [
            'javascript',
            'typescript',
            'coffee',
            'stylus',
            'sass',
            'css',
            'scss',
            'less',
            'postcss',
            'pug',
            'markdown',
          ],
        },
        {
          id: 'swift',
          scopeName: 'source.swift',
          path: 'swift.tmLanguage.json',
        },
        {
          id: 'system-verilog',
          scopeName: 'source.systemverilog',
          path: 'system-verilog.tmLanguage.json',
        },
        {
          id: 'tasl',
          scopeName: 'source.tasl',
          path: 'tasl.tmLanguage.json',
          samplePath: 'tasl.sample',
        },
        { id: 'tcl', scopeName: 'source.tcl', path: 'tcl.tmLanguage.json' },
        {
          id: 'tex',
          scopeName: 'text.tex',
          path: 'tex.tmLanguage.json',
          embeddedLangs: ['r'],
        },
        { id: 'toml', scopeName: 'source.toml', path: 'toml.tmLanguage.json' },
        {
          id: 'tsx',
          scopeName: 'source.tsx',
          path: 'tsx.tmLanguage.json',
          samplePath: 'tsx.sample',
        },
        {
          id: 'turtle',
          scopeName: 'source.turtle',
          path: 'turtle.tmLanguage.json',
          samplePath: 'turtle.sample',
        },
        {
          id: 'twig',
          scopeName: 'text.html.twig',
          path: 'twig.tmLanguage.json',
          embeddedLangs: ['css', 'javascript', 'php', 'python', 'ruby'],
        },
        {
          id: 'typescript',
          scopeName: 'source.ts',
          path: 'typescript.tmLanguage.json',
          aliases: ['ts'],
        },
        {
          id: 'v',
          scopeName: 'source.v',
          path: 'v.tmLanguage.json',
          samplePath: 'v.sample',
        },
        {
          id: 'vb',
          scopeName: 'source.asp.vb.net',
          path: 'vb.tmLanguage.json',
          aliases: ['cmd'],
        },
        {
          id: 'verilog',
          scopeName: 'source.verilog',
          path: 'verilog.tmLanguage.json',
        },
        { id: 'vhdl', scopeName: 'source.vhdl', path: 'vhdl.tmLanguage.json' },
        {
          id: 'viml',
          scopeName: 'source.viml',
          path: 'viml.tmLanguage.json',
          aliases: ['vim', 'vimscript'],
        },
        {
          id: 'vue-html',
          scopeName: 'text.html.vue-html',
          path: 'vue-html.tmLanguage.json',
          embeddedLangs: ['vue', 'javascript'],
        },
        {
          id: 'vue',
          scopeName: 'source.vue',
          path: 'vue.tmLanguage.json',
          embeddedLangs: [
            'html',
            'markdown',
            'pug',
            'stylus',
            'sass',
            'css',
            'scss',
            'less',
            'javascript',
            'typescript',
            'jsx',
            'tsx',
            'json',
            'jsonc',
            'json5',
            'yaml',
            'toml',
            'graphql',
          ],
        },
        { id: 'wasm', scopeName: 'source.wat', path: 'wasm.tmLanguage.json' },
        {
          id: 'wenyan',
          scopeName: 'source.wenyan',
          path: 'wenyan.tmLanguage.json',
          aliases: ['文言'],
        },
        {
          id: 'wgsl',
          scopeName: 'source.wgsl',
          path: 'wgsl.tmLanguage.json',
          samplePath: 'wgsl.sample',
        },
        {
          id: 'wolfram',
          scopeName: 'source.wolfram',
          path: 'wolfram.tmLanguage.json',
          samplePath: 'wolfram.sample',
        },
        {
          id: 'xml',
          scopeName: 'text.xml',
          path: 'xml.tmLanguage.json',
          embeddedLangs: ['java'],
        },
        {
          id: 'xsl',
          scopeName: 'text.xml.xsl',
          path: 'xsl.tmLanguage.json',
          embeddedLangs: ['xml'],
        },
        {
          id: 'yaml',
          scopeName: 'source.yaml',
          path: 'yaml.tmLanguage.json',
          aliases: ['yml'],
        },
        {
          id: 'zenscript',
          scopeName: 'source.zenscript',
          path: 'zenscript.tmLanguage.json',
          samplePath: 'zenscript.sample',
        },
      ];
      var b =
        (((l = b || {})[(l.NotSet = -1)] = 'NotSet'),
        (l[(l.None = 0)] = 'None'),
        (l[(l.Italic = 1)] = 'Italic'),
        (l[(l.Bold = 2)] = 'Bold'),
        (l[(l.Underline = 4)] = 'Underline'),
        l);
      class k {
        static toBinaryStr(e) {
          let t = e.toString(2);
          for (; t.length < 32; ) t = '0' + t;
          return t;
        }
        static printMetadata(e) {
          let t = k.getLanguageId(e),
            n = k.getTokenType(e);
          console.log({
            languageId: t,
            tokenType: n,
            fontStyle: k.getFontStyle(e),
            foreground: k.getForeground(e),
            background: k.getBackground(e),
          });
        }
        static getLanguageId(e) {
          return (255 & e) >>> 0;
        }
        static getTokenType(e) {
          return (768 & e) >>> 8;
        }
        static getFontStyle(e) {
          return (14336 & e) >>> 11;
        }
        static getForeground(e) {
          return (8372224 & e) >>> 15;
        }
        static getBackground(e) {
          return (4286578688 & e) >>> 24;
        }
        static containsBalancedBrackets(e) {
          return (1024 & e) != 0;
        }
        static set(e, t, n, r, s, a) {
          let i = k.getLanguageId(e),
            o = k.getTokenType(e),
            l = k.getFontStyle(e),
            c = k.getForeground(e),
            u = k.getBackground(e),
            h = k.containsBalancedBrackets(e) ? 1 : 0;
          return (
            0 !== t && (i = t),
            0 !== n && (o = 8 === n ? 0 : n),
            -1 !== r && (l = r),
            0 !== s && (c = s),
            0 !== a && (u = a),
            ((i << 0) |
              (o << 8) |
              (l << 11) |
              (h << 10) |
              (c << 15) |
              (u << 24)) >>>
              0
          );
        }
      }
      function y(e) {
        return e.endsWith('/') || e.endsWith('\\') ? e.slice(0, -1) : e;
      }
      function _(e) {
        return e.startsWith('./') ? e.slice(2) : e;
      }
      function x(e) {
        let t = e.split(/[\/\\]/g);
        return t.slice(0, t.length - 1);
      }
      function w(...e) {
        return e.map(y).map(_).join('/');
      }
      function S(e) {
        return 32 === e || 9 === e;
      }
      function v(e) {
        return 10 === e || 13 === e;
      }
      function C(e) {
        return e >= 48 && e <= 57;
      }
      ((c = r || (r = {}))[(c.lineFeed = 10)] = 'lineFeed'),
        (c[(c.carriageReturn = 13)] = 'carriageReturn'),
        (c[(c.space = 32)] = 'space'),
        (c[(c._0 = 48)] = '_0'),
        (c[(c._1 = 49)] = '_1'),
        (c[(c._2 = 50)] = '_2'),
        (c[(c._3 = 51)] = '_3'),
        (c[(c._4 = 52)] = '_4'),
        (c[(c._5 = 53)] = '_5'),
        (c[(c._6 = 54)] = '_6'),
        (c[(c._7 = 55)] = '_7'),
        (c[(c._8 = 56)] = '_8'),
        (c[(c._9 = 57)] = '_9'),
        (c[(c.a = 97)] = 'a'),
        (c[(c.b = 98)] = 'b'),
        (c[(c.c = 99)] = 'c'),
        (c[(c.d = 100)] = 'd'),
        (c[(c.e = 101)] = 'e'),
        (c[(c.f = 102)] = 'f'),
        (c[(c.g = 103)] = 'g'),
        (c[(c.h = 104)] = 'h'),
        (c[(c.i = 105)] = 'i'),
        (c[(c.j = 106)] = 'j'),
        (c[(c.k = 107)] = 'k'),
        (c[(c.l = 108)] = 'l'),
        (c[(c.m = 109)] = 'm'),
        (c[(c.n = 110)] = 'n'),
        (c[(c.o = 111)] = 'o'),
        (c[(c.p = 112)] = 'p'),
        (c[(c.q = 113)] = 'q'),
        (c[(c.r = 114)] = 'r'),
        (c[(c.s = 115)] = 's'),
        (c[(c.t = 116)] = 't'),
        (c[(c.u = 117)] = 'u'),
        (c[(c.v = 118)] = 'v'),
        (c[(c.w = 119)] = 'w'),
        (c[(c.x = 120)] = 'x'),
        (c[(c.y = 121)] = 'y'),
        (c[(c.z = 122)] = 'z'),
        (c[(c.A = 65)] = 'A'),
        (c[(c.B = 66)] = 'B'),
        (c[(c.C = 67)] = 'C'),
        (c[(c.D = 68)] = 'D'),
        (c[(c.E = 69)] = 'E'),
        (c[(c.F = 70)] = 'F'),
        (c[(c.G = 71)] = 'G'),
        (c[(c.H = 72)] = 'H'),
        (c[(c.I = 73)] = 'I'),
        (c[(c.J = 74)] = 'J'),
        (c[(c.K = 75)] = 'K'),
        (c[(c.L = 76)] = 'L'),
        (c[(c.M = 77)] = 'M'),
        (c[(c.N = 78)] = 'N'),
        (c[(c.O = 79)] = 'O'),
        (c[(c.P = 80)] = 'P'),
        (c[(c.Q = 81)] = 'Q'),
        (c[(c.R = 82)] = 'R'),
        (c[(c.S = 83)] = 'S'),
        (c[(c.T = 84)] = 'T'),
        (c[(c.U = 85)] = 'U'),
        (c[(c.V = 86)] = 'V'),
        (c[(c.W = 87)] = 'W'),
        (c[(c.X = 88)] = 'X'),
        (c[(c.Y = 89)] = 'Y'),
        (c[(c.Z = 90)] = 'Z'),
        (c[(c.asterisk = 42)] = 'asterisk'),
        (c[(c.backslash = 92)] = 'backslash'),
        (c[(c.closeBrace = 125)] = 'closeBrace'),
        (c[(c.closeBracket = 93)] = 'closeBracket'),
        (c[(c.colon = 58)] = 'colon'),
        (c[(c.comma = 44)] = 'comma'),
        (c[(c.dot = 46)] = 'dot'),
        (c[(c.doubleQuote = 34)] = 'doubleQuote'),
        (c[(c.minus = 45)] = 'minus'),
        (c[(c.openBrace = 123)] = 'openBrace'),
        (c[(c.openBracket = 91)] = 'openBracket'),
        (c[(c.plus = 43)] = 'plus'),
        (c[(c.slash = 47)] = 'slash'),
        (c[(c.formFeed = 12)] = 'formFeed'),
        (c[(c.tab = 9)] = 'tab'),
        ((s || (s = {})).DEFAULT = { allowTrailingComma: !1 }),
        ((u = a || (a = {}))[(u.None = 0)] = 'None'),
        (u[(u.UnexpectedEndOfComment = 1)] = 'UnexpectedEndOfComment'),
        (u[(u.UnexpectedEndOfString = 2)] = 'UnexpectedEndOfString'),
        (u[(u.UnexpectedEndOfNumber = 3)] = 'UnexpectedEndOfNumber'),
        (u[(u.InvalidUnicode = 4)] = 'InvalidUnicode'),
        (u[(u.InvalidEscapeCharacter = 5)] = 'InvalidEscapeCharacter'),
        (u[(u.InvalidCharacter = 6)] = 'InvalidCharacter'),
        ((h = i || (i = {}))[(h.OpenBraceToken = 1)] = 'OpenBraceToken'),
        (h[(h.CloseBraceToken = 2)] = 'CloseBraceToken'),
        (h[(h.OpenBracketToken = 3)] = 'OpenBracketToken'),
        (h[(h.CloseBracketToken = 4)] = 'CloseBracketToken'),
        (h[(h.CommaToken = 5)] = 'CommaToken'),
        (h[(h.ColonToken = 6)] = 'ColonToken'),
        (h[(h.NullKeyword = 7)] = 'NullKeyword'),
        (h[(h.TrueKeyword = 8)] = 'TrueKeyword'),
        (h[(h.FalseKeyword = 9)] = 'FalseKeyword'),
        (h[(h.StringLiteral = 10)] = 'StringLiteral'),
        (h[(h.NumericLiteral = 11)] = 'NumericLiteral'),
        (h[(h.LineCommentTrivia = 12)] = 'LineCommentTrivia'),
        (h[(h.BlockCommentTrivia = 13)] = 'BlockCommentTrivia'),
        (h[(h.LineBreakTrivia = 14)] = 'LineBreakTrivia'),
        (h[(h.Trivia = 15)] = 'Trivia'),
        (h[(h.Unknown = 16)] = 'Unknown'),
        (h[(h.EOF = 17)] = 'EOF');
      let L = function (e, t = [], n = s.DEFAULT) {
        let r = null,
          a = [],
          i = [];
        function o(e) {
          Array.isArray(a) ? a.push(e) : null !== r && (a[r] = e);
        }
        return (
          (function (e, t, n = s.DEFAULT) {
            let r = (function (e, t = !1) {
                let n = e.length,
                  r = 0,
                  s = '',
                  a = 0,
                  i = 16,
                  o = 0,
                  l = 0,
                  c = 0,
                  u = 0,
                  h = 0;
                function p() {
                  if (((s = ''), (h = 0), (a = r), (l = o), (u = c), r >= n))
                    return (a = n), (i = 17);
                  let t = e.charCodeAt(r);
                  if (S(t)) {
                    do
                      r++, (s += String.fromCharCode(t)), (t = e.charCodeAt(r));
                    while (S(t));
                    return (i = 15);
                  }
                  if (v(t))
                    return (
                      r++,
                      (s += String.fromCharCode(t)),
                      13 === t && 10 === e.charCodeAt(r) && (r++, (s += '\n')),
                      o++,
                      (c = r),
                      (i = 14)
                    );
                  switch (t) {
                    case 123:
                      return r++, (i = 1);
                    case 125:
                      return r++, (i = 2);
                    case 91:
                      return r++, (i = 3);
                    case 93:
                      return r++, (i = 4);
                    case 58:
                      return r++, (i = 6);
                    case 44:
                      return r++, (i = 5);
                    case 34:
                      return (
                        r++,
                        (s = (function () {
                          let t = '',
                            s = r;
                          for (;;) {
                            if (r >= n) {
                              (t += e.substring(s, r)), (h = 2);
                              break;
                            }
                            let a = e.charCodeAt(r);
                            if (34 === a) {
                              (t += e.substring(s, r)), r++;
                              break;
                            }
                            if (92 === a) {
                              if (((t += e.substring(s, r)), ++r >= n)) {
                                h = 2;
                                break;
                              }
                              let a = e.charCodeAt(r++);
                              switch (a) {
                                case 34:
                                  t += '"';
                                  break;
                                case 92:
                                  t += '\\';
                                  break;
                                case 47:
                                  t += '/';
                                  break;
                                case 98:
                                  t += '\b';
                                  break;
                                case 102:
                                  t += '\f';
                                  break;
                                case 110:
                                  t += '\n';
                                  break;
                                case 114:
                                  t += '\r';
                                  break;
                                case 116:
                                  t += '	';
                                  break;
                                case 117:
                                  let i = (function (t, n) {
                                    let s = 0,
                                      a = 0;
                                    for (; s < t || !n; ) {
                                      let t = e.charCodeAt(r);
                                      if (t >= 48 && t <= 57)
                                        a = 16 * a + t - 48;
                                      else if (t >= 65 && t <= 70)
                                        a = 16 * a + t - 65 + 10;
                                      else if (t >= 97 && t <= 102)
                                        a = 16 * a + t - 97 + 10;
                                      else break;
                                      r++, s++;
                                    }
                                    return s < t && (a = -1), a;
                                  })(4, !0);
                                  i >= 0
                                    ? (t += String.fromCharCode(i))
                                    : (h = 4);
                                  break;
                                default:
                                  h = 5;
                              }
                              s = r;
                              continue;
                            }
                            if (a >= 0 && a <= 31) {
                              if (v(a)) {
                                (t += e.substring(s, r)), (h = 2);
                                break;
                              }
                              h = 6;
                            }
                            r++;
                          }
                          return t;
                        })()),
                        (i = 10)
                      );
                    case 47:
                      let p = r - 1;
                      if (47 === e.charCodeAt(r + 1)) {
                        for (r += 2; r < n && !v(e.charCodeAt(r)); ) r++;
                        return (s = e.substring(p, r)), (i = 12);
                      }
                      if (42 === e.charCodeAt(r + 1)) {
                        r += 2;
                        let t = n - 1,
                          a = !1;
                        for (; r < t; ) {
                          let t = e.charCodeAt(r);
                          if (42 === t && 47 === e.charCodeAt(r + 1)) {
                            (r += 2), (a = !0);
                            break;
                          }
                          r++,
                            v(t) &&
                              (13 === t && 10 === e.charCodeAt(r) && r++,
                              o++,
                              (c = r));
                        }
                        return (
                          a || (r++, (h = 1)), (s = e.substring(p, r)), (i = 13)
                        );
                      }
                      return (s += String.fromCharCode(t)), r++, (i = 16);
                    case 45:
                      if (
                        ((s += String.fromCharCode(t)),
                        ++r === n || !C(e.charCodeAt(r)))
                      )
                        return (i = 16);
                    case 48:
                    case 49:
                    case 50:
                    case 51:
                    case 52:
                    case 53:
                    case 54:
                    case 55:
                    case 56:
                    case 57:
                      return (
                        (s += (function () {
                          let t = r;
                          if (48 === e.charCodeAt(r)) r++;
                          else
                            for (r++; r < e.length && C(e.charCodeAt(r)); ) r++;
                          if (r < e.length && 46 === e.charCodeAt(r)) {
                            if (!(++r < e.length && C(e.charCodeAt(r))))
                              return (h = 3), e.substring(t, r);
                            for (r++; r < e.length && C(e.charCodeAt(r)); ) r++;
                          }
                          let n = r;
                          if (
                            r < e.length &&
                            (69 === e.charCodeAt(r) || 101 === e.charCodeAt(r))
                          ) {
                            if (
                              (((++r < e.length && 43 === e.charCodeAt(r)) ||
                                45 === e.charCodeAt(r)) &&
                                r++,
                              r < e.length && C(e.charCodeAt(r)))
                            ) {
                              for (r++; r < e.length && C(e.charCodeAt(r)); )
                                r++;
                              n = r;
                            } else h = 3;
                          }
                          return e.substring(t, n);
                        })()),
                        (i = 11)
                      );
                    default:
                      for (
                        ;
                        r < n &&
                        (function (e) {
                          if (S(e) || v(e)) return !1;
                          switch (e) {
                            case 125:
                            case 93:
                            case 123:
                            case 91:
                            case 34:
                            case 58:
                            case 44:
                            case 47:
                              return !1;
                          }
                          return !0;
                        })(t);

                      )
                        r++, (t = e.charCodeAt(r));
                      if (a !== r) {
                        switch ((s = e.substring(a, r))) {
                          case 'true':
                            return (i = 8);
                          case 'false':
                            return (i = 9);
                          case 'null':
                            return (i = 7);
                        }
                        return (i = 16);
                      }
                      return (s += String.fromCharCode(t)), r++, (i = 16);
                  }
                }
                return {
                  setPosition: function (e) {
                    (r = e), (s = ''), (a = 0), (i = 16), (h = 0);
                  },
                  getPosition: () => r,
                  scan: t
                    ? function () {
                        let e;
                        do e = p();
                        while (e >= 12 && e <= 15);
                        return e;
                      }
                    : p,
                  getToken: () => i,
                  getTokenValue: () => s,
                  getTokenOffset: () => a,
                  getTokenLength: () => r - a,
                  getTokenStartLine: () => l,
                  getTokenStartCharacter: () => a - u,
                  getTokenError: () => h,
                };
              })(e, !1),
              a = [];
            function i(e) {
              return e
                ? () =>
                    e(
                      r.getTokenOffset(),
                      r.getTokenLength(),
                      r.getTokenStartLine(),
                      r.getTokenStartCharacter()
                    )
                : () => !0;
            }
            function o(e) {
              return e
                ? () =>
                    e(
                      r.getTokenOffset(),
                      r.getTokenLength(),
                      r.getTokenStartLine(),
                      r.getTokenStartCharacter(),
                      () => a.slice()
                    )
                : () => !0;
            }
            function l(e) {
              return e
                ? t =>
                    e(
                      t,
                      r.getTokenOffset(),
                      r.getTokenLength(),
                      r.getTokenStartLine(),
                      r.getTokenStartCharacter()
                    )
                : () => !0;
            }
            function c(e) {
              return e
                ? t =>
                    e(
                      t,
                      r.getTokenOffset(),
                      r.getTokenLength(),
                      r.getTokenStartLine(),
                      r.getTokenStartCharacter(),
                      () => a.slice()
                    )
                : () => !0;
            }
            let u = o(t.onObjectBegin),
              h = c(t.onObjectProperty),
              p = i(t.onObjectEnd),
              d = o(t.onArrayBegin),
              f = i(t.onArrayEnd),
              g = c(t.onLiteralValue),
              m = l(t.onSeparator),
              b = i(t.onComment),
              k = l(t.onError),
              y = n && n.disallowComments,
              _ = n && n.allowTrailingComma;
            function x() {
              for (;;) {
                let e = r.scan();
                switch (r.getTokenError()) {
                  case 4:
                    w(14);
                    break;
                  case 5:
                    w(15);
                    break;
                  case 3:
                    w(13);
                    break;
                  case 1:
                    y || w(11);
                    break;
                  case 2:
                    w(12);
                    break;
                  case 6:
                    w(16);
                }
                switch (e) {
                  case 12:
                  case 13:
                    y ? w(10) : b();
                    break;
                  case 16:
                    w(1);
                    break;
                  case 15:
                  case 14:
                    break;
                  default:
                    return e;
                }
              }
            }
            function w(e, t = [], n = []) {
              if ((k(e), t.length + n.length > 0)) {
                let e = r.getToken();
                for (; 17 !== e; ) {
                  if (-1 !== t.indexOf(e)) {
                    x();
                    break;
                  }
                  if (-1 !== n.indexOf(e)) break;
                  e = x();
                }
              }
            }
            function L(e) {
              let t = r.getTokenValue();
              return e ? g(t) : (h(t), a.push(t)), x(), !0;
            }
            if ((x(), 17 === r.getToken()))
              return n.allowEmptyContent || (w(4, [], []), 0);
            (function e() {
              switch (r.getToken()) {
                case 3:
                  return (function () {
                    d(), x();
                    let t = !0,
                      n = !1;
                    for (; 4 !== r.getToken() && 17 !== r.getToken(); ) {
                      if (5 === r.getToken()) {
                        if (
                          (n || w(4, [], []),
                          m(','),
                          x(),
                          4 === r.getToken() && _)
                        )
                          break;
                      } else n && w(6, [], []);
                      t ? (a.push(0), (t = !1)) : a[a.length - 1]++,
                        e() || w(4, [], [4, 5]),
                        (n = !0);
                    }
                    return (
                      f(),
                      t || a.pop(),
                      4 !== r.getToken() ? w(8, [4], []) : x(),
                      !0
                    );
                  })();
                case 1:
                  return (function () {
                    u(), x();
                    let t = !1;
                    for (; 2 !== r.getToken() && 17 !== r.getToken(); ) {
                      if (5 === r.getToken()) {
                        if (
                          (t || w(4, [], []),
                          m(','),
                          x(),
                          2 === r.getToken() && _)
                        )
                          break;
                      } else t && w(6, [], []);
                      (10 !== r.getToken()
                        ? (w(3, [], [2, 5]), 1)
                        : (L(!1),
                          6 === r.getToken()
                            ? (m(':'), x(), e() || w(4, [], [2, 5]))
                            : w(5, [], [2, 5]),
                          a.pop(),
                          0)) && w(4, [], [2, 5]),
                        (t = !0);
                    }
                    return p(), 2 !== r.getToken() ? w(7, [2], []) : x(), !0;
                  })();
                case 10:
                  return L(!0);
                default:
                  return (function () {
                    switch (r.getToken()) {
                      case 11:
                        let e = r.getTokenValue(),
                          t = Number(e);
                        isNaN(t) && (w(2), (t = 0)), g(t);
                        break;
                      case 7:
                        g(null);
                        break;
                      case 8:
                        g(!0);
                        break;
                      case 9:
                        g(!1);
                        break;
                      default:
                        return !1;
                    }
                    return x(), !0;
                  })();
              }
            })()
              ? 17 !== r.getToken() && w(9, [], [])
              : w(4, [], []);
          })(
            e,
            {
              onObjectBegin: () => {
                let e = {};
                o(e), i.push(a), (a = e), (r = null);
              },
              onObjectProperty: e => {
                r = e;
              },
              onObjectEnd: () => {
                a = i.pop();
              },
              onArrayBegin: () => {
                let e = [];
                o(e), i.push(a), (a = e), (r = null);
              },
              onArrayEnd: () => {
                a = i.pop();
              },
              onLiteralValue: o,
              onError: (e, n, r) => {
                t.push({ error: e, offset: n, length: r });
              },
            },
            n
          ),
          a[0]
        );
      };
      ((p = o || (o = {}))[(p.InvalidSymbol = 1)] = 'InvalidSymbol'),
        (p[(p.InvalidNumberFormat = 2)] = 'InvalidNumberFormat'),
        (p[(p.PropertyNameExpected = 3)] = 'PropertyNameExpected'),
        (p[(p.ValueExpected = 4)] = 'ValueExpected'),
        (p[(p.ColonExpected = 5)] = 'ColonExpected'),
        (p[(p.CommaExpected = 6)] = 'CommaExpected'),
        (p[(p.CloseBraceExpected = 7)] = 'CloseBraceExpected'),
        (p[(p.CloseBracketExpected = 8)] = 'CloseBracketExpected'),
        (p[(p.EndOfFileExpected = 9)] = 'EndOfFileExpected'),
        (p[(p.InvalidCommentToken = 10)] = 'InvalidCommentToken'),
        (p[(p.UnexpectedEndOfComment = 11)] = 'UnexpectedEndOfComment'),
        (p[(p.UnexpectedEndOfString = 12)] = 'UnexpectedEndOfString'),
        (p[(p.UnexpectedEndOfNumber = 13)] = 'UnexpectedEndOfNumber'),
        (p[(p.InvalidUnicode = 14)] = 'InvalidUnicode'),
        (p[(p.InvalidEscapeCharacter = 15)] = 'InvalidEscapeCharacter'),
        (p[(p.InvalidCharacter = 16)] = 'InvalidCharacter');
      let P = 'undefined' != typeof self && void 0 !== self.WorkerGlobalScope,
        T =
          'process' in globalThis &&
          void 0 !== g &&
          void 0 !== g.release &&
          'node' === g.release.name,
        N = P || !T,
        A = null;
      async function R(e) {
        if (!A) {
          let t;
          if (N)
            t = (0, d.loadWASM)({
              data: await fetch(E(w(...x(e), 'onig.wasm'))),
            });
          else {
            let e = n(29686),
              r = e.join(28873, '../onig.wasm'),
              s = n(81323),
              a = s.readFileSync(r).buffer;
            t = (0, d.loadWASM)(a);
          }
          A = t.then(() => ({
            createOnigScanner: e => (0, d.createOnigScanner)(e),
            createOnigString: e => (0, d.createOnigString)(e),
          }));
        }
        return A;
      }
      function E(e) {
        if (N) return `${e}`;
        {
          let t = n(29686);
          return t.isAbsolute(e) ? e : t.resolve('/', '..', e);
        }
      }
      async function j(e) {
        let t = E(e);
        if (N) return await fetch(t).then(e => e.text());
        {
          let e = n(81323);
          return await e.promises.readFile(t, 'utf-8');
        }
      }
      async function I(e) {
        let t;
        let n = [],
          r = await j(e);
        try {
          t = JSON.parse(r);
        } catch (e) {
          if (((t = L(r, n, { allowTrailingComma: !0 })), n.length)) throw n[0];
        }
        return t;
      }
      async function $(e) {
        let t = await I(e),
          n = B(t);
        if (n.include) {
          let t = await $(w(...x(e), n.include));
          t.settings && (n.settings = t.settings.concat(n.settings)),
            t.bg && !n.bg && (n.bg = t.bg),
            t.colors && (n.colors = { ...t.colors, ...n.colors }),
            delete n.include;
        }
        return n;
      }
      async function O(e) {
        return await I(e);
      }
      function B(e) {
        var t;
        let n = e.type || 'dark',
          r = {
            name: e.name,
            type: n,
            ...e,
            ...(function (e) {
              let t, n;
              let r = e.settings ? e.settings : e.tokenColors,
                s = r ? r.find(e => !e.name && !e.scope) : void 0;
              return (
                s?.settings?.foreground && (t = s.settings.foreground),
                s?.settings?.background && (n = s.settings.background),
                !t &&
                  e?.colors?.['editor.foreground'] &&
                  (t = e.colors['editor.foreground']),
                !n &&
                  e?.colors?.['editor.background'] &&
                  (n = e.colors['editor.background']),
                t || (t = 'light' === e.type ? M.light : M.dark),
                n || (n = 'light' === e.type ? D.light : D.dark),
                { fg: t, bg: n }
              );
            })(e),
          };
        return (
          e.include && (r.include = e.include),
          e.tokenColors && ((r.settings = e.tokenColors), delete r.tokenColors),
          (t = r).settings || (t.settings = []),
          (t.settings[0] && t.settings[0].settings && !t.settings[0].scope) ||
            t.settings.unshift({
              settings: { foreground: t.fg, background: t.bg },
            }),
          r
        );
      }
      let M = { light: '#333333', dark: '#bbbbbb' },
        D = { light: '#fffffe', dark: '#1e1e1e' };
      class F {
        constructor(e, t) {
          (this.languagesPath = 'languages/'),
            (this.languageMap = {}),
            (this.scopeToLangMap = {}),
            (this._onigLibPromise = e),
            (this._onigLibName = t);
        }
        get onigLib() {
          return this._onigLibPromise;
        }
        getOnigLibName() {
          return this._onigLibName;
        }
        getLangRegistration(e) {
          return this.languageMap[e];
        }
        async loadGrammar(e) {
          let t = this.scopeToLangMap[e];
          if (!t) return null;
          if (t.grammar) return t.grammar;
          let n = await O(
            m.includes(t) ? `${this.languagesPath}${t.path}` : t.path
          );
          return (t.grammar = n), n;
        }
        addLanguage(e) {
          (this.languageMap[e.id] = e),
            e.aliases &&
              e.aliases.forEach(t => {
                this.languageMap[t] = e;
              }),
            (this.scopeToLangMap[e.scopeName] = e);
        }
      }
      function G(e, t) {
        let n = e + '.';
        return e === t || t.substring(0, n.length) === n;
      }
      var H = [
          'black',
          'red',
          'green',
          'yellow',
          'blue',
          'magenta',
          'cyan',
          'white',
          'brightBlack',
          'brightRed',
          'brightGreen',
          'brightYellow',
          'brightBlue',
          'brightMagenta',
          'brightCyan',
          'brightWhite',
        ],
        U = {
          1: 'bold',
          2: 'dim',
          3: 'italic',
          4: 'underline',
          7: 'reverse',
          9: 'strikethrough',
        };
      function z(e) {
        let t = e.shift();
        if ('2' === t) {
          let t = e.splice(0, 3).map(e => Number.parseInt(e));
          if (3 !== t.length || t.some(e => Number.isNaN(e))) return;
          return { type: 'rgb', rgb: t };
        }
        if ('5' === t) {
          let t = e.shift();
          if (t) return { type: 'table', index: Number(t) };
        }
      }
      var q = {
        black: '#000000',
        red: '#bb0000',
        green: '#00bb00',
        yellow: '#bbbb00',
        blue: '#0000bb',
        magenta: '#ff00ff',
        cyan: '#00bbbb',
        white: '#eeeeee',
        brightBlack: '#555555',
        brightRed: '#ff5555',
        brightGreen: '#00ff00',
        brightYellow: '#ffff55',
        brightBlue: '#5555ff',
        brightMagenta: '#ff55ff',
        brightCyan: '#55ffff',
        brightWhite: '#ffffff',
      };
      let W = {
        pre: ({ className: e, style: t, children: n }) =>
          `<pre class="${e}" style="${t}" tabindex="0">${n}</pre>`,
        code: ({ children: e }) => `<code>${e}</code>`,
        line: ({ className: e, children: t }) =>
          `<span class="${e}">${t}</span>`,
        token: ({ style: e, children: t }) => `<span style="${e}">${t}</span>`,
      };
      function V(e, t = {}) {
        let n = t.bg || '#fff',
          r = (function (e, t) {
            let n = new Map();
            for (let r of e) {
              let e = t(r);
              if (n.has(e)) {
                let t = n.get(e);
                t.push(r);
              } else n.set(e, [r]);
            }
            return n;
          })(t.lineOptions ?? [], e => e.line),
          s = t.elements || {};
        function a(e = '', t = {}, n) {
          let r = s[e] || W[e];
          return r
            ? ((n = n.filter(Boolean)),
              r({ ...t, children: 'code' === e ? n.join('\n') : n.join('') }))
            : '';
        }
        return a(
          'pre',
          {
            className: 'shiki ' + (t.themeName || ''),
            style: `background-color: ${n}`,
          },
          [
            t.langId ? `<div class="language-id">${t.langId}</div>` : '',
            a(
              'code',
              {},
              e.map((n, s) => {
                let i = r.get(s + 1) ?? [],
                  o = (function (e) {
                    let t = new Set(['line']);
                    for (let n of e) for (let e of n.classes ?? []) t.add(e);
                    return Array.from(t);
                  })(i).join(' ');
                return a(
                  'line',
                  { className: o, lines: e, line: n, index: s },
                  n.map((e, r) => {
                    let s = [`color: ${e.color || t.fg}`];
                    return (
                      e.fontStyle & b.Italic && s.push('font-style: italic'),
                      e.fontStyle & b.Bold && s.push('font-weight: bold'),
                      e.fontStyle & b.Underline &&
                        s.push('text-decoration: underline'),
                      a(
                        'token',
                        { style: s.join('; '), tokens: n, token: e, index: r },
                        [e.content.replace(/[&<>"']/g, e => Q[e])]
                      )
                    );
                  })
                );
              })
            ),
          ]
        );
      }
      let Q = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      class K extends f.Registry {
        constructor(e) {
          super(e),
            (this._resolver = e),
            (this.themesPath = 'themes/'),
            (this._resolvedThemes = {}),
            (this._resolvedGrammars = {}),
            (this._langGraph = new Map()),
            (this._langMap = m.reduce((e, t) => ((e[t.id] = t), e), {}));
        }
        getTheme(e) {
          return 'string' == typeof e ? this._resolvedThemes[e] : e;
        }
        async loadTheme(e) {
          return 'string' == typeof e
            ? (this._resolvedThemes[e] ||
                (this._resolvedThemes[e] = await $(
                  `${this.themesPath}${e}.json`
                )),
              this._resolvedThemes[e])
            : ((e = B(e)).name && (this._resolvedThemes[e.name] = e), e);
        }
        async loadThemes(e) {
          return await Promise.all(e.map(e => this.loadTheme(e)));
        }
        getLoadedThemes() {
          return Object.keys(this._resolvedThemes);
        }
        getGrammar(e) {
          return this._resolvedGrammars[e];
        }
        async loadLanguage(e) {
          let t = e.embeddedLangs?.reduce(async (e, t, n) => {
              if (
                !this.getLoadedLanguages().includes(t) &&
                this._resolver.getLangRegistration(t)
              )
                return (
                  await this._resolver.loadGrammar(
                    this._resolver.getLangRegistration(t).scopeName
                  ),
                  (e[this._resolver.getLangRegistration(t).scopeName] = n + 2),
                  e
                );
            }, {}),
            n = {
              embeddedLanguages: t,
              balancedBracketSelectors: e.balancedBracketSelectors || ['*'],
              unbalancedBracketSelectors: e.unbalancedBracketSelectors || [],
            },
            r = await this.loadGrammarWithConfiguration(e.scopeName, 1, n);
          (this._resolvedGrammars[e.id] = r),
            e.aliases &&
              e.aliases.forEach(e => {
                this._resolvedGrammars[e] = r;
              });
        }
        async loadLanguages(e) {
          for (let t of e) this.resolveEmbeddedLanguages(t);
          let t = Array.from(this._langGraph.values());
          for (let e of t) this._resolver.addLanguage(e);
          for (let e of t) await this.loadLanguage(e);
        }
        getLoadedLanguages() {
          return Object.keys(this._resolvedGrammars);
        }
        resolveEmbeddedLanguages(e) {
          if (
            (this._langGraph.has(e.id) || this._langGraph.set(e.id, e),
            e.embeddedLangs)
          )
            for (let t of e.embeddedLangs)
              this._langGraph.set(t, this._langMap[t]);
        }
      }
      function Z(e) {
        return 'string' == typeof e
          ? m.find(t => t.id === e || t.aliases?.includes(e))
          : e;
      }
      async function Y(e) {
        let t, n, r, s;
        let {
            _languages: a,
            _themes: i,
            _wasmPath: o,
          } = ((n = m),
          (r = e.themes || []),
          (s = e.paths?.wasm
            ? e.paths.wasm.endsWith('/')
              ? e.paths.wasm
              : e.paths.wasm + '/'
            : 'dist/'),
          e.langs && (n = e.langs.map(Z)),
          e.theme && r.unshift(e.theme),
          r.length || (r = ['nord']),
          { _languages: n, _themes: r, _wasmPath: s }),
          l = new F(R(o), 'vscode-oniguruma'),
          c = new K(l);
        e.paths?.themes &&
          (c.themesPath = e.paths.themes.endsWith('/')
            ? e.paths.themes
            : e.paths.themes + '/'),
          e.paths?.languages &&
            (l.languagesPath = e.paths.languages.endsWith('/')
              ? e.paths.languages
              : e.paths.languages + '/');
        let u = await c.loadThemes(i),
          h = u[0];
        await c.loadLanguages(a);
        let p = (function () {
          let e = {
            '#000001': 'var(--shiki-color-text)',
            '#000002': 'var(--shiki-color-background)',
            '#000004': 'var(--shiki-token-constant)',
            '#000005': 'var(--shiki-token-string)',
            '#000006': 'var(--shiki-token-comment)',
            '#000007': 'var(--shiki-token-keyword)',
            '#000008': 'var(--shiki-token-parameter)',
            '#000009': 'var(--shiki-token-function)',
            '#000010': 'var(--shiki-token-string-expression)',
            '#000011': 'var(--shiki-token-punctuation)',
            '#000012': 'var(--shiki-token-link)',
          };
          for (let t = 0; t < H.length; t++) {
            let n = `#A${t.toString().padStart(5, '0')}`,
              r = H[t].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            e[n] = `var(--shiki-color-ansi-${r})`;
          }
          return e;
        })();
        function d(e) {
          let n = e ? c.getTheme(e) : h;
          if (!n) throw Error(`No theme registration for ${e}`);
          (t && t.name === n.name) || (c.setTheme(n), (t = n));
          let r = c.getColorMap();
          if ('css' === n.type) {
            var s, a;
            (s = n),
              (a = r),
              (s.bg = p[s.bg] || s.bg),
              (s.fg = p[s.fg] || s.fg),
              Object.entries(s.colors).forEach(([e, t]) => {
                s.colors[e] = p[t] || t;
              }),
              a.forEach((e, t) => {
                a[t] = p[e] || e;
              });
          }
          return { _theme: n, _colorMap: r };
        }
        function g(e, t = 'text', n, r = { includeExplanation: !0 }) {
          if (!t || ['plaintext', 'txt', 'text'].includes(t)) {
            let t = e.split(/\r\n|\r|\n/);
            return [...t.map(e => [{ content: e }])];
          }
          let { _grammar: s } = (function (e) {
              let t = c.getGrammar(e);
              if (!t) throw Error(`No language registration for ${e}`);
              return { _grammar: t };
            })(t),
            { _theme: a, _colorMap: i } = d(n);
          return (function (e, t, n, r, s) {
            let a = n.split(/\r\n|\r|\n/),
              i = f.INITIAL,
              o = [],
              l = [];
            for (let n = 0, c = a.length; n < c; n++) {
              let c,
                u,
                h = a[n];
              if ('' === h) {
                (o = []), l.push([]);
                continue;
              }
              s.includeExplanation &&
                ((c = r.tokenizeLine(h, i).tokens), (u = 0));
              let p = r.tokenizeLine2(h, i),
                d = p.tokens.length / 2;
              for (let n = 0; n < d; n++) {
                let r = p.tokens[2 * n],
                  a = n + 1 < d ? p.tokens[2 * n + 2] : h.length;
                if (r === a) continue;
                let i = p.tokens[2 * n + 1],
                  l = t[k.getForeground(i)],
                  f = k.getFontStyle(i),
                  g = [];
                if (s.includeExplanation) {
                  let t = 0;
                  for (; r + t < a; ) {
                    let n = c[u],
                      r = h.substring(n.startIndex, n.endIndex);
                    (t += r.length),
                      g.push({
                        content: r,
                        scopes: (function (e, t) {
                          let n = [];
                          for (let r = 0, s = t.length; r < s; r++) {
                            let s = t.slice(0, r),
                              a = t[r];
                            n[r] = {
                              scopeName: a,
                              themeMatches: (function (e, t, n) {
                                let r = [],
                                  s = 0;
                                for (
                                  let a = 0, i = e.settings.length;
                                  a < i;
                                  a++
                                ) {
                                  let i,
                                    o = e.settings[a];
                                  if ('string' == typeof o.scope)
                                    i = o.scope.split(/,/).map(e => e.trim());
                                  else {
                                    if (!Array.isArray(o.scope)) continue;
                                    i = o.scope;
                                  }
                                  for (let e = 0, a = i.length; e < a; e++) {
                                    let l = i[e].split(/ /);
                                    (function (e, t, n, r) {
                                      if (!G(e, n)) return !1;
                                      let s = t.length - 1,
                                        a = r.length - 1;
                                      for (; s >= 0 && a >= 0; )
                                        G(t[s], r[a]) && s--, a--;
                                      return -1 === s;
                                    })(
                                      l[l.length - 1],
                                      l.slice(0, l.length - 1),
                                      t,
                                      n
                                    ) && ((r[s++] = o), (e = a));
                                  }
                                }
                                return r;
                              })(e, a, s),
                            };
                          }
                          return n;
                        })(e, n.scopes),
                      }),
                      u++;
                  }
                }
                o.push({
                  content: h.substring(r, a),
                  color: l,
                  fontStyle: f,
                  explanation: g,
                });
              }
              l.push(o), (o = []), (i = p.ruleStack);
            }
            return l;
          })(a, i, e, s, r);
        }
        function y(e, t) {
          let { _theme: n } = d(t);
          return (function (e, t) {
            let n, r, s;
            let a = t.split(/\r?\n/),
              i = (function (e = q) {
                let t;
                function n(e) {
                  return `#${e
                    .map(e =>
                      Math.max(0, Math.min(e, 255))
                        .toString(16)
                        .padStart(2, '0')
                    )
                    .join('')}`;
                }
                return {
                  value: function (r) {
                    switch (r.type) {
                      case 'named':
                        return e[r.name];
                      case 'rgb':
                        return n(r.rgb);
                      case 'table':
                        var s;
                        return (
                          (s = r.index),
                          (function () {
                            if (t) return t;
                            t = [];
                            for (let n = 0; n < H.length; n++) t.push(e[H[n]]);
                            let r = [0, 95, 135, 175, 215, 255];
                            for (let e = 0; e < 6; e++)
                              for (let s = 0; s < 6; s++)
                                for (let a = 0; a < 6; a++)
                                  t.push(n([r[e], r[s], r[a]]));
                            let s = 8;
                            for (let e = 0; e < 24; e++, s += 10)
                              t.push(n([s, s, s]));
                            return t;
                          })()[s]
                        );
                    }
                  },
                };
              })(
                Object.fromEntries(
                  H.map(t => [
                    t,
                    e.colors[
                      `terminal.ansi${t[0].toUpperCase()}${t.substring(1)}`
                    ],
                  ])
                )
              ),
              o =
                ((n = null),
                (r = null),
                (s = new Set()),
                {
                  parse(e) {
                    let t = [],
                      a = 0;
                    do {
                      let i = (function (e, t) {
                          let n = e.indexOf('\x1b', t);
                          if (-1 !== n && '[' === e[n + 1]) {
                            let t = e.indexOf('m', n);
                            return {
                              sequence: e.substring(n + 2, t).split(';'),
                              startPosition: n,
                              position: t + 1,
                            };
                          }
                          return { position: e.length };
                        })(e, a),
                        o = i.sequence
                          ? e.substring(a, i.startPosition)
                          : e.substring(a);
                      if (
                        (o.length > 0 &&
                          t.push({
                            value: o,
                            foreground: n,
                            background: r,
                            decorations: new Set(s),
                          }),
                        i.sequence)
                      ) {
                        let e = (function (e) {
                          let t = [];
                          for (; e.length > 0; ) {
                            let n = e.shift();
                            if (!n) continue;
                            let r = Number.parseInt(n);
                            if (!Number.isNaN(r)) {
                              if (0 === r) t.push({ type: 'resetAll' });
                              else if (r <= 9) {
                                let e = U[r];
                                e &&
                                  t.push({
                                    type: 'setDecoration',
                                    value: U[r],
                                  });
                              } else if (r <= 29) {
                                let e = U[r - 20];
                                e &&
                                  t.push({ type: 'resetDecoration', value: e });
                              } else if (r <= 37)
                                t.push({
                                  type: 'setForegroundColor',
                                  value: { type: 'named', name: H[r - 30] },
                                });
                              else if (38 === r) {
                                let n = z(e);
                                n &&
                                  t.push({
                                    type: 'setForegroundColor',
                                    value: n,
                                  });
                              } else if (39 === r)
                                t.push({ type: 'resetForegroundColor' });
                              else if (r <= 47)
                                t.push({
                                  type: 'setBackgroundColor',
                                  value: { type: 'named', name: H[r - 40] },
                                });
                              else if (48 === r) {
                                let n = z(e);
                                n &&
                                  t.push({
                                    type: 'setBackgroundColor',
                                    value: n,
                                  });
                              } else
                                49 === r
                                  ? t.push({ type: 'resetBackgroundColor' })
                                  : r >= 90 && r <= 97
                                  ? t.push({
                                      type: 'setForegroundColor',
                                      value: {
                                        type: 'named',
                                        name: H[r - 90 + 8],
                                      },
                                    })
                                  : r >= 100 &&
                                    r <= 107 &&
                                    t.push({
                                      type: 'setBackgroundColor',
                                      value: {
                                        type: 'named',
                                        name: H[r - 100 + 8],
                                      },
                                    });
                            }
                          }
                          return t;
                        })(i.sequence);
                        for (let t of e)
                          'resetAll' === t.type
                            ? ((n = null), (r = null), s.clear())
                            : 'resetForegroundColor' === t.type
                            ? (n = null)
                            : 'resetBackgroundColor' === t.type
                            ? (r = null)
                            : 'resetDecoration' === t.type && s.delete(t.value);
                        for (let t of e)
                          'setForegroundColor' === t.type
                            ? (n = t.value)
                            : 'setBackgroundColor' === t.type
                            ? (r = t.value)
                            : 'setDecoration' === t.type && s.add(t.value);
                      }
                      a = i.position;
                    } while (a < e.length);
                    return t;
                  },
                });
            return a.map(t =>
              o.parse(t).map(t => {
                let n;
                (n = t.decorations.has('reverse')
                  ? t.background
                    ? i.value(t.background)
                    : e.bg
                  : t.foreground
                  ? i.value(t.foreground)
                  : e.fg),
                  t.decorations.has('dim') &&
                    (n = (function (e) {
                      let t = e.match(
                        /#([0-9a-f]{3})([0-9a-f]{3})?([0-9a-f]{2})?/
                      );
                      if (t) {
                        if (t[3]) {
                          let e = Math.round(Number.parseInt(t[3], 16) / 2)
                            .toString(16)
                            .padStart(2, '0');
                          return `#${t[1]}${t[2]}${e}`;
                        }
                        return t[2]
                          ? `#${t[1]}${t[2]}80`
                          : `#${Array.from(t[1])
                              .map(e => `${e}${e}`)
                              .join('')}80`;
                      }
                      let n = e.match(/var\((--shiki-color-ansi-[\w-]+)\)/);
                      return n ? `var(${n[1]}-dim)` : e;
                    })(n));
                let r = b.None;
                return (
                  t.decorations.has('bold') && (r |= b.Bold),
                  t.decorations.has('italic') && (r |= b.Italic),
                  t.decorations.has('underline') && (r |= b.Underline),
                  { content: t.value, color: n, fontStyle: r }
                );
              })
            );
          })(n, e);
        }
        return {
          codeToThemedTokens: g,
          codeToHtml: function (e, t = 'text', n) {
            let r;
            r = 'object' == typeof t ? t : { lang: t, theme: n };
            let s = g(e, r.lang, r.theme, { includeExplanation: !1 }),
              { _theme: a } = d(r.theme);
            return V(s, {
              fg: a.fg,
              bg: a.bg,
              lineOptions: r?.lineOptions,
              themeName: a.name,
            });
          },
          ansiToThemedTokens: y,
          ansiToHtml: function (e, t) {
            let n = y(e, t?.theme),
              { _theme: r } = d(t?.theme);
            return V(n, {
              fg: r.fg,
              bg: r.bg,
              lineOptions: t?.lineOptions,
              themeName: r.name,
            });
          },
          getTheme: e => d(e)._theme,
          loadTheme: async function (e) {
            await c.loadTheme(e);
          },
          loadLanguage: async function (e) {
            let t = Z(e);
            l.addLanguage(t), await c.loadLanguage(t);
          },
          getBackgroundColor: function (e) {
            let { _theme: t } = d(e);
            return t.bg;
          },
          getForegroundColor: function (e) {
            let { _theme: t } = d(e);
            return t.fg;
          },
          getLoadedThemes: function () {
            return c.getLoadedThemes();
          },
          getLoadedLanguages: function () {
            return c.getLoadedLanguages();
          },
          setColorReplacements: function (e) {
            p = e;
          },
        };
      }
    },
    28873: function (e) {
      var t, n;
      e.exports =
        ((t = {
          770: function (e, t, n) {
            'use strict';
            var r =
              (this && this.__importDefault) ||
              function (e) {
                return e && e.__esModule ? e : { default: e };
              };
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.setDefaultDebugCall =
                t.createOnigScanner =
                t.createOnigString =
                t.loadWASM =
                t.OnigScanner =
                t.OnigString =
                  void 0);
            let s = r(n(418)),
              a = null,
              i = !1;
            class o {
              static _utf8ByteLength(e) {
                let t = 0;
                for (let n = 0, r = e.length; n < r; n++) {
                  let s = e.charCodeAt(n),
                    a = s,
                    i = !1;
                  if (s >= 55296 && s <= 56319 && n + 1 < r) {
                    let t = e.charCodeAt(n + 1);
                    t >= 56320 &&
                      t <= 57343 &&
                      ((a = (65536 + ((s - 55296) << 10)) | (t - 56320)),
                      (i = !0));
                  }
                  (t += a <= 127 ? 1 : a <= 2047 ? 2 : a <= 65535 ? 3 : 4),
                    i && n++;
                }
                return t;
              }
              constructor(e) {
                let t = e.length,
                  n = o._utf8ByteLength(e),
                  r = n !== t,
                  s = r ? new Uint32Array(t + 1) : null;
                r && (s[t] = n);
                let a = r ? new Uint32Array(n + 1) : null;
                r && (a[n] = t);
                let i = new Uint8Array(n),
                  l = 0;
                for (let n = 0; n < t; n++) {
                  let o = e.charCodeAt(n),
                    c = o,
                    u = !1;
                  if (o >= 55296 && o <= 56319 && n + 1 < t) {
                    let t = e.charCodeAt(n + 1);
                    t >= 56320 &&
                      t <= 57343 &&
                      ((c = (65536 + ((o - 55296) << 10)) | (t - 56320)),
                      (u = !0));
                  }
                  r &&
                    ((s[n] = l),
                    u && (s[n + 1] = l),
                    c <= 127
                      ? (a[l + 0] = n)
                      : c <= 2047
                      ? ((a[l + 0] = n), (a[l + 1] = n))
                      : c <= 65535
                      ? ((a[l + 0] = n), (a[l + 1] = n), (a[l + 2] = n))
                      : ((a[l + 0] = n),
                        (a[l + 1] = n),
                        (a[l + 2] = n),
                        (a[l + 3] = n))),
                    c <= 127
                      ? (i[l++] = c)
                      : c <= 2047
                      ? ((i[l++] = 192 | ((1984 & c) >>> 6)),
                        (i[l++] = 128 | ((63 & c) >>> 0)))
                      : c <= 65535
                      ? ((i[l++] = 224 | ((61440 & c) >>> 12)),
                        (i[l++] = 128 | ((4032 & c) >>> 6)),
                        (i[l++] = 128 | ((63 & c) >>> 0)))
                      : ((i[l++] = 240 | ((1835008 & c) >>> 18)),
                        (i[l++] = 128 | ((258048 & c) >>> 12)),
                        (i[l++] = 128 | ((4032 & c) >>> 6)),
                        (i[l++] = 128 | ((63 & c) >>> 0))),
                    u && n++;
                }
                (this.utf16Length = t),
                  (this.utf8Length = n),
                  (this.utf16Value = e),
                  (this.utf8Value = i),
                  (this.utf16OffsetToUtf8 = s),
                  (this.utf8OffsetToUtf16 = a);
              }
              createString(e) {
                let t = e._omalloc(this.utf8Length);
                return e.HEAPU8.set(this.utf8Value, t), t;
              }
            }
            class l {
              constructor(e) {
                if (((this.id = ++l.LAST_ID), !a))
                  throw Error('Must invoke loadWASM first.');
                (this._onigBinding = a), (this.content = e);
                let t = new o(e);
                (this.utf16Length = t.utf16Length),
                  (this.utf8Length = t.utf8Length),
                  (this.utf16OffsetToUtf8 = t.utf16OffsetToUtf8),
                  (this.utf8OffsetToUtf16 = t.utf8OffsetToUtf16),
                  this.utf8Length < 1e4 && !l._sharedPtrInUse
                    ? (l._sharedPtr || (l._sharedPtr = a._omalloc(1e4)),
                      (l._sharedPtrInUse = !0),
                      a.HEAPU8.set(t.utf8Value, l._sharedPtr),
                      (this.ptr = l._sharedPtr))
                    : (this.ptr = t.createString(a));
              }
              convertUtf8OffsetToUtf16(e) {
                return this.utf8OffsetToUtf16
                  ? e < 0
                    ? 0
                    : e > this.utf8Length
                    ? this.utf16Length
                    : this.utf8OffsetToUtf16[e]
                  : e;
              }
              convertUtf16OffsetToUtf8(e) {
                return this.utf16OffsetToUtf8
                  ? e < 0
                    ? 0
                    : e > this.utf16Length
                    ? this.utf8Length
                    : this.utf16OffsetToUtf8[e]
                  : e;
              }
              dispose() {
                this.ptr === l._sharedPtr
                  ? (l._sharedPtrInUse = !1)
                  : this._onigBinding._ofree(this.ptr);
              }
            }
            (t.OnigString = l),
              (l.LAST_ID = 0),
              (l._sharedPtr = 0),
              (l._sharedPtrInUse = !1);
            class c {
              constructor(e) {
                if (!a) throw Error('Must invoke loadWASM first.');
                let t = [],
                  n = [];
                for (let r = 0, s = e.length; r < s; r++) {
                  let s = new o(e[r]);
                  (t[r] = s.createString(a)), (n[r] = s.utf8Length);
                }
                let r = a._omalloc(4 * e.length);
                a.HEAPU32.set(t, r / 4);
                let s = a._omalloc(4 * e.length);
                a.HEAPU32.set(n, s / 4);
                let i = a._createOnigScanner(r, s, e.length);
                for (let n = 0, r = e.length; n < r; n++) a._ofree(t[n]);
                a._ofree(s),
                  a._ofree(r),
                  0 === i &&
                    (function (e) {
                      throw Error(e.UTF8ToString(e._getLastOnigError()));
                    })(a),
                  (this._onigBinding = a),
                  (this._ptr = i);
              }
              dispose() {
                this._onigBinding._freeOnigScanner(this._ptr);
              }
              findNextMatchSync(e, t, n) {
                let r = i,
                  s = 0;
                if (
                  ('number' == typeof n
                    ? (8 & n && (r = !0), (s = n))
                    : 'boolean' == typeof n && (r = n),
                  'string' == typeof e)
                ) {
                  e = new l(e);
                  let n = this._findNextMatchSync(e, t, r, s);
                  return e.dispose(), n;
                }
                return this._findNextMatchSync(e, t, r, s);
              }
              _findNextMatchSync(e, t, n, r) {
                let s;
                let a = this._onigBinding;
                if (
                  0 ===
                  (s = n
                    ? a._findNextOnigScannerMatchDbg(
                        this._ptr,
                        e.id,
                        e.ptr,
                        e.utf8Length,
                        e.convertUtf16OffsetToUtf8(t),
                        r
                      )
                    : a._findNextOnigScannerMatch(
                        this._ptr,
                        e.id,
                        e.ptr,
                        e.utf8Length,
                        e.convertUtf16OffsetToUtf8(t),
                        r
                      ))
                )
                  return null;
                let i = a.HEAPU32,
                  o = s / 4,
                  l = i[o++],
                  c = i[o++],
                  u = [];
                for (let t = 0; t < c; t++) {
                  let n = e.convertUtf8OffsetToUtf16(i[o++]),
                    r = e.convertUtf8OffsetToUtf16(i[o++]);
                  u[t] = { start: n, end: r, length: r - n };
                }
                return { index: l, captureIndices: u };
              }
            }
            t.OnigScanner = c;
            let u = !1,
              h = null;
            (t.loadWASM = function (e) {
              let t, n, r, i;
              if (u) return h;
              if (((u = !0), 'function' == typeof e.instantiator))
                (t = e.instantiator), (n = e.print);
              else {
                var o, l, c, p;
                let r;
                void 0 !== e.data ? ((r = e.data), (n = e.print)) : (r = e),
                  (o = r),
                  (t =
                    'undefined' != typeof Response && o instanceof Response
                      ? 'function' == typeof WebAssembly.instantiateStreaming
                        ? ((l = r), e => WebAssembly.instantiateStreaming(l, e))
                        : ((c = r),
                          async e => {
                            let t = await c.arrayBuffer();
                            return WebAssembly.instantiate(t, e);
                          })
                      : ((p = r), e => WebAssembly.instantiate(p, e)));
              }
              return (
                (h = new Promise((e, t) => {
                  (r = e), (i = t);
                })),
                (function (e, t, n, r) {
                  (0, s.default)({
                    print: t,
                    instantiateWasm: (t, n) => {
                      if ('undefined' == typeof performance) {
                        let e = () => Date.now();
                        (t.env.emscripten_get_now = e),
                          (t.wasi_snapshot_preview1.emscripten_get_now = e);
                      }
                      return e(t).then(e => n(e.instance), r), {};
                    },
                  }).then(e => {
                    (a = e), n();
                  });
                })(t, n, r, i),
                h
              );
            }),
              (t.createOnigString = function (e) {
                return new l(e);
              }),
              (t.createOnigScanner = function (e) {
                return new c(e);
              }),
              (t.setDefaultDebugCall = function (e) {
                i = e;
              });
          },
          418: e => {
            var t =
              ('undefined' != typeof document &&
                document.currentScript &&
                document.currentScript.src,
              function (e) {
                var t,
                  n,
                  r = void 0 !== (e = e || {}) ? e : {};
                r.ready = new Promise(function (e, r) {
                  (t = e), (n = r);
                });
                var s,
                  a = Object.assign({}, r),
                  i = [];
                (s = function (e) {
                  let t;
                  return 'function' == typeof readbuffer
                    ? new Uint8Array(readbuffer(e))
                    : ('object' == typeof (t = read(e, 'binary')) || v(void 0),
                      t);
                }),
                  'undefined' != typeof scriptArgs
                    ? (i = scriptArgs)
                    : void 0 !== arguments && (i = arguments),
                  'undefined' != typeof onig_print &&
                    ('undefined' == typeof console && (console = {}),
                    (console.log = onig_print),
                    (console.warn = console.error =
                      'undefined' != typeof printErr ? printErr : onig_print));
                var o,
                  l,
                  c = r.print || console.log.bind(console),
                  u = r.printErr || console.warn.bind(console);
                Object.assign(r, a),
                  (a = null),
                  r.arguments && (i = r.arguments),
                  r.thisProgram && r.thisProgram,
                  r.quit && r.quit,
                  r.wasmBinary && (o = r.wasmBinary),
                  r.noExitRuntime,
                  'object' != typeof WebAssembly &&
                    v('no native wasm support detected');
                var h,
                  p,
                  d,
                  f = !1,
                  g =
                    'undefined' != typeof TextDecoder
                      ? new TextDecoder('utf8')
                      : void 0;
                function m(e, t, n) {
                  for (var r = t + n, s = t; e[s] && !(s >= r); ) ++s;
                  if (s - t > 16 && e.buffer && g)
                    return g.decode(e.subarray(t, s));
                  for (var a = ''; t < s; ) {
                    var i = e[t++];
                    if (128 & i) {
                      var o = 63 & e[t++];
                      if (192 != (224 & i)) {
                        var l = 63 & e[t++];
                        if (
                          (i =
                            224 == (240 & i)
                              ? ((15 & i) << 12) | (o << 6) | l
                              : ((7 & i) << 18) |
                                (o << 12) |
                                (l << 6) |
                                (63 & e[t++])) < 65536
                        )
                          a += String.fromCharCode(i);
                        else {
                          var c = i - 65536;
                          a += String.fromCharCode(
                            55296 | (c >> 10),
                            56320 | (1023 & c)
                          );
                        }
                      } else a += String.fromCharCode(((31 & i) << 6) | o);
                    } else a += String.fromCharCode(i);
                  }
                  return a;
                }
                function b(e) {
                  (h = e),
                    (r.HEAP8 = new Int8Array(e)),
                    (r.HEAP16 = new Int16Array(e)),
                    (r.HEAP32 = new Int32Array(e)),
                    (r.HEAPU8 = p = new Uint8Array(e)),
                    (r.HEAPU16 = new Uint16Array(e)),
                    (r.HEAPU32 = d = new Uint32Array(e)),
                    (r.HEAPF32 = new Float32Array(e)),
                    (r.HEAPF64 = new Float64Array(e));
                }
                r.INITIAL_MEMORY;
                var k = [],
                  y = [],
                  _ = [],
                  x = 0,
                  w = null,
                  S = null;
                function v(e) {
                  r.onAbort && r.onAbort(e),
                    u((e = 'Aborted(' + e + ')')),
                    (f = !0),
                    (e += '. Build with -sASSERTIONS for more info.');
                  var t = new WebAssembly.RuntimeError(e);
                  throw (n(t), t);
                }
                function C(e) {
                  return e.startsWith('data:application/octet-stream;base64,');
                }
                function L(e) {
                  for (; e.length > 0; ) e.shift()(r);
                }
                C((P = 'onig.wasm')) ||
                  ((T = P), (P = r.locateFile ? r.locateFile(T, '') : '' + T));
                var P,
                  T,
                  N,
                  A = [null, [], []],
                  R = {
                    emscripten_get_now:
                      'undefined' != typeof dateNow
                        ? dateNow
                        : () => performance.now(),
                    emscripten_memcpy_big: function (e, t, n) {
                      p.copyWithin(e, t, t + n);
                    },
                    emscripten_resize_heap: function (e) {
                      var t,
                        n = p.length;
                      if ((e >>>= 0) > 2147483648) return !1;
                      for (var r = 1; r <= 4; r *= 2) {
                        var s = n * (1 + 0.2 / r);
                        if (
                          ((s = Math.min(s, e + 100663296)),
                          (function (e) {
                            try {
                              return (
                                l.grow((e - h.byteLength + 65535) >>> 16),
                                b(l.buffer),
                                1
                              );
                            } catch (e) {}
                          })(
                            Math.min(
                              2147483648,
                              (t = Math.max(e, s)) +
                                ((65536 - (t % 65536)) % 65536)
                            )
                          ))
                        )
                          return !0;
                      }
                      return !1;
                    },
                    fd_write: function (e, t, n, r) {
                      for (var s = 0, a = 0; a < n; a++) {
                        var i = d[t >> 2],
                          o = d[(t + 4) >> 2];
                        t += 8;
                        for (var l = 0; l < o; l++)
                          (function (e, t) {
                            var n = A[e];
                            0 === t || 10 === t
                              ? ((1 === e ? c : u)(m(n, 0)), (n.length = 0))
                              : n.push(t);
                          })(e, p[i + l]);
                        s += o;
                      }
                      return (d[r >> 2] = s), 0;
                    },
                  };
                function E(e) {
                  function n() {
                    N ||
                      ((N = !0),
                      (r.calledRun = !0),
                      f ||
                        (L(y),
                        t(r),
                        r.onRuntimeInitialized && r.onRuntimeInitialized(),
                        (function () {
                          if (r.postRun)
                            for (
                              'function' == typeof r.postRun &&
                              (r.postRun = [r.postRun]);
                              r.postRun.length;

                            ) {
                              var e;
                              (e = r.postRun.shift()), _.unshift(e);
                            }
                          L(_);
                        })()));
                  }
                  (e = e || i),
                    x > 0 ||
                      ((function () {
                        if (r.preRun)
                          for (
                            'function' == typeof r.preRun &&
                            (r.preRun = [r.preRun]);
                            r.preRun.length;

                          ) {
                            var e;
                            (e = r.preRun.shift()), k.unshift(e);
                          }
                        L(k);
                      })(),
                      x > 0 ||
                        (r.setStatus
                          ? (r.setStatus('Running...'),
                            setTimeout(function () {
                              setTimeout(function () {
                                r.setStatus('');
                              }, 1),
                                n();
                            }, 1))
                          : n()));
                }
                if (
                  ((function () {
                    var e = { env: R, wasi_snapshot_preview1: R };
                    function t(e, t) {
                      var n,
                        s = e.exports;
                      (r.asm = s),
                        b((l = r.asm.memory).buffer),
                        r.asm.__indirect_function_table,
                        (n = r.asm.__wasm_call_ctors),
                        y.unshift(n),
                        (function () {
                          if (
                            (x--,
                            r.monitorRunDependencies &&
                              r.monitorRunDependencies(x),
                            0 == x &&
                              (null !== w && (clearInterval(w), (w = null)), S))
                          ) {
                            var e = S;
                            (S = null), e();
                          }
                        })();
                    }
                    function a(e) {
                      t(e.instance);
                    }
                    function i(t) {
                      return Promise.resolve()
                        .then(function () {
                          return (function (e) {
                            try {
                              if (e == P && o) return new Uint8Array(o);
                              if (s) return s(e);
                              throw 'both async and sync fetching of the wasm failed';
                            } catch (e) {
                              v(e);
                            }
                          })(P);
                        })
                        .then(function (t) {
                          return WebAssembly.instantiate(t, e);
                        })
                        .then(function (e) {
                          return e;
                        })
                        .then(t, function (e) {
                          u('failed to asynchronously prepare wasm: ' + e),
                            v(e);
                        });
                    }
                    if (
                      (x++,
                      r.monitorRunDependencies && r.monitorRunDependencies(x),
                      r.instantiateWasm)
                    )
                      try {
                        return r.instantiateWasm(e, t);
                      } catch (e) {
                        u(
                          'Module.instantiateWasm callback failed with error: ' +
                            e
                        ),
                          n(e);
                      }
                    (o ||
                    'function' != typeof WebAssembly.instantiateStreaming ||
                    C(P) ||
                    'function' != typeof fetch
                      ? i(a)
                      : fetch(P, { credentials: 'same-origin' }).then(function (
                          t
                        ) {
                          return WebAssembly.instantiateStreaming(t, e).then(
                            a,
                            function (e) {
                              return (
                                u('wasm streaming compile failed: ' + e),
                                u('falling back to ArrayBuffer instantiation'),
                                i(a)
                              );
                            }
                          );
                        })
                    ).catch(n);
                  })(),
                  (r.___wasm_call_ctors = function () {
                    return (r.___wasm_call_ctors =
                      r.asm.__wasm_call_ctors).apply(null, arguments);
                  }),
                  (r.___errno_location = function () {
                    return (r.___errno_location = r.asm.__errno_location).apply(
                      null,
                      arguments
                    );
                  }),
                  (r._omalloc = function () {
                    return (r._omalloc = r.asm.omalloc).apply(null, arguments);
                  }),
                  (r._ofree = function () {
                    return (r._ofree = r.asm.ofree).apply(null, arguments);
                  }),
                  (r._getLastOnigError = function () {
                    return (r._getLastOnigError = r.asm.getLastOnigError).apply(
                      null,
                      arguments
                    );
                  }),
                  (r._createOnigScanner = function () {
                    return (r._createOnigScanner =
                      r.asm.createOnigScanner).apply(null, arguments);
                  }),
                  (r._freeOnigScanner = function () {
                    return (r._freeOnigScanner = r.asm.freeOnigScanner).apply(
                      null,
                      arguments
                    );
                  }),
                  (r._findNextOnigScannerMatch = function () {
                    return (r._findNextOnigScannerMatch =
                      r.asm.findNextOnigScannerMatch).apply(null, arguments);
                  }),
                  (r._findNextOnigScannerMatchDbg = function () {
                    return (r._findNextOnigScannerMatchDbg =
                      r.asm.findNextOnigScannerMatchDbg).apply(null, arguments);
                  }),
                  (r.stackSave = function () {
                    return (r.stackSave = r.asm.stackSave).apply(
                      null,
                      arguments
                    );
                  }),
                  (r.stackRestore = function () {
                    return (r.stackRestore = r.asm.stackRestore).apply(
                      null,
                      arguments
                    );
                  }),
                  (r.stackAlloc = function () {
                    return (r.stackAlloc = r.asm.stackAlloc).apply(
                      null,
                      arguments
                    );
                  }),
                  (r.dynCall_jiji = function () {
                    return (r.dynCall_jiji = r.asm.dynCall_jiji).apply(
                      null,
                      arguments
                    );
                  }),
                  (r.UTF8ToString = function (e, t) {
                    return e ? m(p, e, t) : '';
                  }),
                  (S = function e() {
                    N || E(), N || (S = e);
                  }),
                  r.preInit)
                )
                  for (
                    'function' == typeof r.preInit && (r.preInit = [r.preInit]);
                    r.preInit.length > 0;

                  )
                    r.preInit.pop()();
                return E(), e.ready;
              });
            e.exports = t;
          },
        }),
        (n = {}),
        (function e(r) {
          var s = n[r];
          if (void 0 !== s) return s.exports;
          var a = (n[r] = { exports: {} });
          return t[r].call(a.exports, a, a.exports, e), a.exports;
        })(770));
    },
    91126: function (e, t, n) {
      var r,
        s,
        a = n(34406);
      e.exports =
        ((r = {
          350: (e, t) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.UseOnigurumaFindOptions = t.DebugFlags = void 0),
              (t.DebugFlags = {
                InDebugMode: void 0 !== a && !!a.env.VSCODE_TEXTMATE_DEBUG,
              }),
              (t.UseOnigurumaFindOptions = !1);
          },
          36: (e, t) => {
            var n;
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.toOptionalTokenType = t.EncodedTokenAttributes = void 0),
              ((n =
                t.EncodedTokenAttributes ||
                (t.EncodedTokenAttributes = {})).toBinaryStr = function (e) {
                let t = e.toString(2);
                for (; t.length < 32; ) t = '0' + t;
                return t;
              }),
              (n.print = function (e) {
                let t = n.getLanguageId(e),
                  r = n.getTokenType(e),
                  s = n.getFontStyle(e),
                  a = n.getForeground(e),
                  i = n.getBackground(e);
                console.log({
                  languageId: t,
                  tokenType: r,
                  fontStyle: s,
                  foreground: a,
                  background: i,
                });
              }),
              (n.getLanguageId = function (e) {
                return (255 & e) >>> 0;
              }),
              (n.getTokenType = function (e) {
                return (768 & e) >>> 8;
              }),
              (n.containsBalancedBrackets = function (e) {
                return 0 != (1024 & e);
              }),
              (n.getFontStyle = function (e) {
                return (30720 & e) >>> 11;
              }),
              (n.getForeground = function (e) {
                return (16744448 & e) >>> 15;
              }),
              (n.getBackground = function (e) {
                return (4278190080 & e) >>> 24;
              }),
              (n.set = function (e, t, r, s, a, i, o) {
                let l = n.getLanguageId(e),
                  c = n.getTokenType(e),
                  u = n.containsBalancedBrackets(e) ? 1 : 0,
                  h = n.getFontStyle(e),
                  p = n.getForeground(e),
                  d = n.getBackground(e);
                return (
                  0 !== t && (l = t),
                  8 !== r && (c = r),
                  null !== s && (u = s ? 1 : 0),
                  -1 !== a && (h = a),
                  0 !== i && (p = i),
                  0 !== o && (d = o),
                  ((l << 0) |
                    (c << 8) |
                    (u << 10) |
                    (h << 11) |
                    (p << 15) |
                    (d << 24)) >>>
                    0
                );
              }),
              (t.toOptionalTokenType = function (e) {
                return e;
              });
          },
          996: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.BasicScopeAttributesProvider = t.BasicScopeAttributes =
                void 0);
            let r = n(878);
            class s {
              constructor(e, t) {
                (this.languageId = e), (this.tokenType = t);
              }
            }
            t.BasicScopeAttributes = s;
            class a {
              constructor(e, t) {
                (this._getBasicScopeAttributes = new r.CachedFn(e => {
                  let t = this._scopeToLanguage(e),
                    n = this._toStandardTokenType(e);
                  return new s(t, n);
                })),
                  (this._defaultAttributes = new s(e, 8)),
                  (this._embeddedLanguagesMatcher = new i(
                    Object.entries(t || {})
                  ));
              }
              getDefaultAttributes() {
                return this._defaultAttributes;
              }
              getBasicScopeAttributes(e) {
                return null === e
                  ? a._NULL_SCOPE_METADATA
                  : this._getBasicScopeAttributes.get(e);
              }
              _scopeToLanguage(e) {
                return this._embeddedLanguagesMatcher.match(e) || 0;
              }
              _toStandardTokenType(e) {
                let t = e.match(a.STANDARD_TOKEN_TYPE_REGEXP);
                if (!t) return 8;
                switch (t[1]) {
                  case 'comment':
                    return 1;
                  case 'string':
                    return 2;
                  case 'regex':
                    return 3;
                  case 'meta.embedded':
                    return 0;
                }
                throw Error('Unexpected match for standard token type!');
              }
            }
            (t.BasicScopeAttributesProvider = a),
              (a._NULL_SCOPE_METADATA = new s(0, 0)),
              (a.STANDARD_TOKEN_TYPE_REGEXP =
                /\b(comment|string|regex|meta\.embedded)\b/);
            class i {
              constructor(e) {
                if (0 === e.length)
                  (this.values = null), (this.scopesRegExp = null);
                else {
                  this.values = new Map(e);
                  let t = e.map(([e, t]) => r.escapeRegExpCharacters(e));
                  t.sort(),
                    t.reverse(),
                    (this.scopesRegExp = RegExp(
                      `^((${t.join(')|(')}))($|\\.)`,
                      ''
                    ));
                }
              }
              match(e) {
                if (!this.scopesRegExp) return;
                let t = e.match(this.scopesRegExp);
                return t ? this.values.get(t[1]) : void 0;
              }
            }
          },
          947: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.LineTokens =
                t.BalancedBracketSelectors =
                t.StateStack =
                t.AttributedScopeStack =
                t.Grammar =
                t.createGrammar =
                  void 0);
            let r = n(350),
              s = n(36),
              a = n(736),
              i = n(44),
              o = n(792),
              l = n(583),
              c = n(878),
              u = n(996),
              h = n(47);
            function p(e, t, n, r, s) {
              let i = a.createMatchers(t, d),
                l = o.RuleFactory.getCompiledRuleId(n, r, s.repository);
              for (let n of i)
                e.push({
                  debugSelector: t,
                  matcher: n.matcher,
                  ruleId: l,
                  grammar: s,
                  priority: n.priority,
                });
            }
            function d(e, t) {
              if (t.length < e.length) return !1;
              let n = 0;
              return e.every(e => {
                for (let r = n; r < t.length; r++)
                  if (
                    (function (e, t) {
                      if (!e) return !1;
                      if (e === t) return !0;
                      let n = t.length;
                      return (
                        e.length > n && e.substr(0, n) === t && '.' === e[n]
                      );
                    })(t[r], e)
                  )
                    return (n = r + 1), !0;
                return !1;
              });
            }
            t.createGrammar = function (e, t, n, r, s, a, i, o) {
              return new f(e, t, n, r, s, a, i, o);
            };
            class f {
              constructor(e, t, n, r, s, i, o, l) {
                if (
                  ((this._rootScopeName = e),
                  (this.balancedBracketSelectors = i),
                  (this._onigLib = l),
                  (this._basicScopeAttributesProvider =
                    new u.BasicScopeAttributesProvider(n, r)),
                  (this._rootId = -1),
                  (this._lastRuleId = 0),
                  (this._ruleId2desc = [null]),
                  (this._includedGrammars = {}),
                  (this._grammarRepository = o),
                  (this._grammar = g(t, null)),
                  (this._injections = null),
                  (this._tokenTypeMatchers = []),
                  s)
                )
                  for (let e of Object.keys(s)) {
                    let t = a.createMatchers(e, d);
                    for (let n of t)
                      this._tokenTypeMatchers.push({
                        matcher: n.matcher,
                        type: s[e],
                      });
                  }
              }
              get themeProvider() {
                return this._grammarRepository;
              }
              dispose() {
                for (let e of this._ruleId2desc) e && e.dispose();
              }
              createOnigScanner(e) {
                return this._onigLib.createOnigScanner(e);
              }
              createOnigString(e) {
                return this._onigLib.createOnigString(e);
              }
              getMetadataForScope(e) {
                return this._basicScopeAttributesProvider.getBasicScopeAttributes(
                  e
                );
              }
              _collectInjections() {
                let e = [],
                  t = this._rootScopeName,
                  n =
                    t === this._rootScopeName
                      ? this._grammar
                      : this.getExternalGrammar(t);
                if (n) {
                  let r = n.injections;
                  if (r) for (let t in r) p(e, t, r[t], this, n);
                  let s = this._grammarRepository.injections(t);
                  s &&
                    s.forEach(t => {
                      let n = this.getExternalGrammar(t);
                      if (n) {
                        let t = n.injectionSelector;
                        t && p(e, t, n, this, n);
                      }
                    });
                }
                return e.sort((e, t) => e.priority - t.priority), e;
              }
              getInjections() {
                if (
                  null === this._injections &&
                  ((this._injections = this._collectInjections()),
                  r.DebugFlags.InDebugMode && this._injections.length > 0)
                )
                  for (let e of (console.log(
                    `Grammar ${this._rootScopeName} contains the following injections:`
                  ),
                  this._injections))
                    console.log(`  - ${e.debugSelector}`);
                return this._injections;
              }
              registerRule(e) {
                let t = ++this._lastRuleId,
                  n = e(o.ruleIdFromNumber(t));
                return (this._ruleId2desc[t] = n), n;
              }
              getRule(e) {
                return this._ruleId2desc[o.ruleIdToNumber(e)];
              }
              getExternalGrammar(e, t) {
                if (this._includedGrammars[e]) return this._includedGrammars[e];
                if (this._grammarRepository) {
                  let n = this._grammarRepository.lookup(e);
                  if (n)
                    return (
                      (this._includedGrammars[e] = g(n, t && t.$base)),
                      this._includedGrammars[e]
                    );
                }
              }
              tokenizeLine(e, t, n = 0) {
                let r = this._tokenize(e, t, !1, n);
                return {
                  tokens: r.lineTokens.getResult(r.ruleStack, r.lineLength),
                  ruleStack: r.ruleStack,
                  stoppedEarly: r.stoppedEarly,
                };
              }
              tokenizeLine2(e, t, n = 0) {
                let r = this._tokenize(e, t, !0, n);
                return {
                  tokens: r.lineTokens.getBinaryResult(
                    r.ruleStack,
                    r.lineLength
                  ),
                  ruleStack: r.ruleStack,
                  stoppedEarly: r.stoppedEarly,
                };
              }
              _tokenize(e, t, n, r) {
                let a;
                if (
                  (-1 === this._rootId &&
                    (this._rootId = o.RuleFactory.getCompiledRuleId(
                      this._grammar.repository.$self,
                      this,
                      this._grammar.repository
                    )),
                  t && t !== b.NULL)
                )
                  (a = !1), t.reset();
                else {
                  let e;
                  a = !0;
                  let n =
                      this._basicScopeAttributesProvider.getDefaultAttributes(),
                    r = this.themeProvider.getDefaults(),
                    i = s.EncodedTokenAttributes.set(
                      0,
                      n.languageId,
                      n.tokenType,
                      null,
                      r.fontStyle,
                      r.foregroundId,
                      r.backgroundId
                    ),
                    o = this.getRule(this._rootId).getName(null, null);
                  (e = o
                    ? m.createRootAndLookUpScopeName(o, i, this)
                    : m.createRoot('unknown', i)),
                    (t = new b(null, this._rootId, -1, -1, !1, null, e, e));
                }
                e += '\n';
                let l = this.createOnigString(e),
                  c = l.content.length,
                  u = new k(
                    n,
                    e,
                    this._tokenTypeMatchers,
                    this.balancedBracketSelectors
                  ),
                  p = h._tokenizeString(this, l, a, 0, t, u, !0, r);
                return (
                  i.disposeOnigString(l),
                  {
                    lineLength: c,
                    lineTokens: u,
                    ruleStack: p.stack,
                    stoppedEarly: p.stoppedEarly,
                  }
                );
              }
            }
            function g(e, t) {
              return (
                ((e = c.clone(e)).repository = e.repository || {}),
                (e.repository.$self = {
                  $vscodeTextmateLocation: e.$vscodeTextmateLocation,
                  patterns: e.patterns,
                  name: e.scopeName,
                }),
                (e.repository.$base = t || e.repository.$self),
                e
              );
            }
            t.Grammar = f;
            class m {
              constructor(e, t, n) {
                (this.parent = e),
                  (this.scopePath = t),
                  (this.tokenAttributes = n);
              }
              static createRoot(e, t) {
                return new m(null, new l.ScopeStack(null, e), t);
              }
              static createRootAndLookUpScopeName(e, t, n) {
                let r = n.getMetadataForScope(e),
                  s = new l.ScopeStack(null, e),
                  a = n.themeProvider.themeMatch(s),
                  i = m.mergeAttributes(t, r, a);
                return new m(null, s, i);
              }
              get scopeName() {
                return this.scopePath.scopeName;
              }
              equals(e) {
                return m._equals(this, e);
              }
              static _equals(e, t) {
                for (;;) {
                  if (e === t || (!e && !t)) return !0;
                  if (
                    !e ||
                    !t ||
                    e.scopeName !== t.scopeName ||
                    e.tokenAttributes !== t.tokenAttributes
                  )
                    return !1;
                  (e = e.parent), (t = t.parent);
                }
              }
              static mergeAttributes(e, t, n) {
                let r = -1,
                  a = 0,
                  i = 0;
                return (
                  null !== n &&
                    ((r = n.fontStyle),
                    (a = n.foregroundId),
                    (i = n.backgroundId)),
                  s.EncodedTokenAttributes.set(
                    e,
                    t.languageId,
                    t.tokenType,
                    null,
                    r,
                    a,
                    i
                  )
                );
              }
              pushAttributed(e, t) {
                if (null === e) return this;
                if (-1 === e.indexOf(' ')) return m._pushAttributed(this, e, t);
                let n = e.split(/ /g),
                  r = this;
                for (let e of n) r = m._pushAttributed(r, e, t);
                return r;
              }
              static _pushAttributed(e, t, n) {
                let r = n.getMetadataForScope(t),
                  s = e.scopePath.push(t),
                  a = n.themeProvider.themeMatch(s),
                  i = m.mergeAttributes(e.tokenAttributes, r, a);
                return new m(e, s, i);
              }
              getScopeNames() {
                return this.scopePath.getSegments();
              }
            }
            t.AttributedScopeStack = m;
            class b {
              constructor(e, t, n, r, s, a, i, o) {
                (this.parent = e),
                  (this.ruleId = t),
                  (this.beginRuleCapturedEOL = s),
                  (this.endRule = a),
                  (this.nameScopesList = i),
                  (this.contentNameScopesList = o),
                  (this._stackElementBrand = void 0),
                  (this.depth = this.parent ? this.parent.depth + 1 : 1),
                  (this._enterPos = n),
                  (this._anchorPos = r);
              }
              equals(e) {
                return null !== e && b._equals(this, e);
              }
              static _equals(e, t) {
                return (
                  e === t ||
                  (!!this._structuralEquals(e, t) &&
                    e.contentNameScopesList.equals(t.contentNameScopesList))
                );
              }
              static _structuralEquals(e, t) {
                for (;;) {
                  if (e === t || (!e && !t)) return !0;
                  if (
                    !e ||
                    !t ||
                    e.depth !== t.depth ||
                    e.ruleId !== t.ruleId ||
                    e.endRule !== t.endRule
                  )
                    return !1;
                  (e = e.parent), (t = t.parent);
                }
              }
              clone() {
                return this;
              }
              static _reset(e) {
                for (; e; )
                  (e._enterPos = -1), (e._anchorPos = -1), (e = e.parent);
              }
              reset() {
                b._reset(this);
              }
              pop() {
                return this.parent;
              }
              safePop() {
                return this.parent ? this.parent : this;
              }
              push(e, t, n, r, s, a, i) {
                return new b(this, e, t, n, r, s, a, i);
              }
              getEnterPos() {
                return this._enterPos;
              }
              getAnchorPos() {
                return this._anchorPos;
              }
              getRule(e) {
                return e.getRule(this.ruleId);
              }
              toString() {
                let e = [];
                return this._writeString(e, 0), '[' + e.join(',') + ']';
              }
              _writeString(e, t) {
                return (
                  this.parent && (t = this.parent._writeString(e, t)),
                  (e[
                    t++
                  ] = `(${this.ruleId}, TODO-${this.nameScopesList}, TODO-${this.contentNameScopesList})`),
                  t
                );
              }
              withContentNameScopesList(e) {
                return this.contentNameScopesList === e
                  ? this
                  : this.parent.push(
                      this.ruleId,
                      this._enterPos,
                      this._anchorPos,
                      this.beginRuleCapturedEOL,
                      this.endRule,
                      this.nameScopesList,
                      e
                    );
              }
              withEndRule(e) {
                return this.endRule === e
                  ? this
                  : new b(
                      this.parent,
                      this.ruleId,
                      this._enterPos,
                      this._anchorPos,
                      this.beginRuleCapturedEOL,
                      e,
                      this.nameScopesList,
                      this.contentNameScopesList
                    );
              }
              hasSameRuleAs(e) {
                let t = this;
                for (; t && t._enterPos === e._enterPos; ) {
                  if (t.ruleId === e.ruleId) return !0;
                  t = t.parent;
                }
                return !1;
              }
            }
            (t.StateStack = b),
              (b.NULL = new b(null, 0, 0, 0, !1, null, null, null)),
              (t.BalancedBracketSelectors = class {
                constructor(e, t) {
                  (this.allowAny = !1),
                    (this.balancedBracketScopes = e.flatMap(e =>
                      '*' === e
                        ? ((this.allowAny = !0), [])
                        : a.createMatchers(e, d).map(e => e.matcher)
                    )),
                    (this.unbalancedBracketScopes = t.flatMap(e =>
                      a.createMatchers(e, d).map(e => e.matcher)
                    ));
                }
                get matchesAlways() {
                  return (
                    this.allowAny && 0 === this.unbalancedBracketScopes.length
                  );
                }
                get matchesNever() {
                  return (
                    0 === this.balancedBracketScopes.length && !this.allowAny
                  );
                }
                match(e) {
                  for (let t of this.unbalancedBracketScopes)
                    if (t(e)) return !1;
                  for (let t of this.balancedBracketScopes) if (t(e)) return !0;
                  return this.allowAny;
                }
              });
            class k {
              constructor(e, t, n, s) {
                (this.balancedBracketSelectors = s),
                  (this._emitBinaryTokens = e),
                  (this._tokenTypeOverrides = n),
                  r.DebugFlags.InDebugMode
                    ? (this._lineText = t)
                    : (this._lineText = null),
                  (this._tokens = []),
                  (this._binaryTokens = []),
                  (this._lastTokenEndIndex = 0);
              }
              produce(e, t) {
                this.produceFromScopes(e.contentNameScopesList, t);
              }
              produceFromScopes(e, t) {
                if (this._lastTokenEndIndex >= t) return;
                if (this._emitBinaryTokens) {
                  let n = e.tokenAttributes,
                    a = !1;
                  if (
                    (this.balancedBracketSelectors?.matchesAlways && (a = !0),
                    this._tokenTypeOverrides.length > 0 ||
                      (this.balancedBracketSelectors &&
                        !this.balancedBracketSelectors.matchesAlways &&
                        !this.balancedBracketSelectors.matchesNever))
                  ) {
                    let t = e.getScopeNames();
                    for (let e of this._tokenTypeOverrides)
                      e.matcher(t) &&
                        (n = s.EncodedTokenAttributes.set(
                          n,
                          0,
                          s.toOptionalTokenType(e.type),
                          null,
                          -1,
                          0,
                          0
                        ));
                    this.balancedBracketSelectors &&
                      (a = this.balancedBracketSelectors.match(t));
                  }
                  if (
                    (a &&
                      (n = s.EncodedTokenAttributes.set(n, 0, 8, a, -1, 0, 0)),
                    this._binaryTokens.length > 0 &&
                      this._binaryTokens[this._binaryTokens.length - 1] === n)
                  )
                    return void (this._lastTokenEndIndex = t);
                  if (r.DebugFlags.InDebugMode) {
                    let n = e.getScopeNames();
                    console.log(
                      '  token: |' +
                        this._lineText
                          .substring(this._lastTokenEndIndex, t)
                          .replace(/\n$/, '\\n') +
                        '|'
                    );
                    for (let e = 0; e < n.length; e++)
                      console.log('      * ' + n[e]);
                  }
                  return (
                    this._binaryTokens.push(this._lastTokenEndIndex),
                    this._binaryTokens.push(n),
                    void (this._lastTokenEndIndex = t)
                  );
                }
                let n = e.getScopeNames();
                if (r.DebugFlags.InDebugMode) {
                  console.log(
                    '  token: |' +
                      this._lineText
                        .substring(this._lastTokenEndIndex, t)
                        .replace(/\n$/, '\\n') +
                      '|'
                  );
                  for (let e = 0; e < n.length; e++)
                    console.log('      * ' + n[e]);
                }
                this._tokens.push({
                  startIndex: this._lastTokenEndIndex,
                  endIndex: t,
                  scopes: n,
                }),
                  (this._lastTokenEndIndex = t);
              }
              getResult(e, t) {
                return (
                  this._tokens.length > 0 &&
                    this._tokens[this._tokens.length - 1].startIndex ===
                      t - 1 &&
                    this._tokens.pop(),
                  0 === this._tokens.length &&
                    ((this._lastTokenEndIndex = -1),
                    this.produce(e, t),
                    (this._tokens[this._tokens.length - 1].startIndex = 0)),
                  this._tokens
                );
              }
              getBinaryResult(e, t) {
                this._binaryTokens.length > 0 &&
                  this._binaryTokens[this._binaryTokens.length - 2] === t - 1 &&
                  (this._binaryTokens.pop(), this._binaryTokens.pop()),
                  0 === this._binaryTokens.length &&
                    ((this._lastTokenEndIndex = -1),
                    this.produce(e, t),
                    (this._binaryTokens[this._binaryTokens.length - 2] = 0));
                let n = new Uint32Array(this._binaryTokens.length);
                for (let e = 0, t = this._binaryTokens.length; e < t; e++)
                  n[e] = this._binaryTokens[e];
                return n;
              }
            }
            t.LineTokens = k;
          },
          965: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.parseInclude =
                t.TopLevelRepositoryReference =
                t.TopLevelReference =
                t.RelativeReference =
                t.SelfReference =
                t.BaseReference =
                t.ScopeDependencyProcessor =
                t.ExternalReferenceCollector =
                t.TopLevelRepositoryRuleReference =
                t.TopLevelRuleReference =
                  void 0);
            let r = n(878);
            class s {
              constructor(e) {
                this.scopeName = e;
              }
              toKey() {
                return this.scopeName;
              }
            }
            t.TopLevelRuleReference = s;
            class a {
              constructor(e, t) {
                (this.scopeName = e), (this.ruleName = t);
              }
              toKey() {
                return `${this.scopeName}#${this.ruleName}`;
              }
            }
            t.TopLevelRepositoryRuleReference = a;
            class i {
              constructor() {
                (this._references = []),
                  (this._seenReferenceKeys = new Set()),
                  (this.visitedRule = new Set());
              }
              get references() {
                return this._references;
              }
              add(e) {
                let t = e.toKey();
                this._seenReferenceKeys.has(t) ||
                  (this._seenReferenceKeys.add(t), this._references.push(e));
              }
            }
            function o(e, t, n) {
              t.repository && t.repository[e] && c([t.repository[e]], t, n);
            }
            function l(e, t) {
              e.selfGrammar.patterns &&
                Array.isArray(e.selfGrammar.patterns) &&
                c(
                  e.selfGrammar.patterns,
                  { ...e, repository: e.selfGrammar.repository },
                  t
                ),
                e.selfGrammar.injections &&
                  c(
                    Object.values(e.selfGrammar.injections),
                    { ...e, repository: e.selfGrammar.repository },
                    t
                  );
            }
            function c(e, t, n) {
              for (let i of e) {
                if (n.visitedRule.has(i)) continue;
                n.visitedRule.add(i);
                let e = i.repository
                  ? r.mergeObjects({}, t.repository, i.repository)
                  : t.repository;
                Array.isArray(i.patterns) &&
                  c(i.patterns, { ...t, repository: e }, n);
                let u = i.include;
                if (!u) continue;
                let h = g(u);
                switch (h.kind) {
                  case 0:
                    l({ ...t, selfGrammar: t.baseGrammar }, n);
                    break;
                  case 1:
                    l(t, n);
                    break;
                  case 2:
                    o(h.ruleName, { ...t, repository: e }, n);
                    break;
                  case 3:
                  case 4:
                    let p =
                      h.scopeName === t.selfGrammar.scopeName
                        ? t.selfGrammar
                        : h.scopeName === t.baseGrammar.scopeName
                        ? t.baseGrammar
                        : void 0;
                    if (p) {
                      let r = {
                        baseGrammar: t.baseGrammar,
                        selfGrammar: p,
                        repository: e,
                      };
                      4 === h.kind ? o(h.ruleName, r, n) : l(r, n);
                    } else
                      4 === h.kind
                        ? n.add(new a(h.scopeName, h.ruleName))
                        : n.add(new s(h.scopeName));
                }
              }
            }
            (t.ExternalReferenceCollector = i),
              (t.ScopeDependencyProcessor = class {
                constructor(e, t) {
                  (this.repo = e),
                    (this.initialScopeName = t),
                    (this.seenFullScopeRequests = new Set()),
                    (this.seenPartialScopeRequests = new Set()),
                    this.seenFullScopeRequests.add(this.initialScopeName),
                    (this.Q = [new s(this.initialScopeName)]);
                }
                processQueue() {
                  let e = this.Q;
                  this.Q = [];
                  let t = new i();
                  for (let n of e)
                    (function (e, t, n, r) {
                      let a = n.lookup(e.scopeName);
                      if (!a) {
                        if (e.scopeName === t)
                          throw Error(`No grammar provided for <${t}>`);
                        return;
                      }
                      let i = n.lookup(t);
                      e instanceof s
                        ? l({ baseGrammar: i, selfGrammar: a }, r)
                        : o(
                            e.ruleName,
                            {
                              baseGrammar: i,
                              selfGrammar: a,
                              repository: a.repository,
                            },
                            r
                          );
                      let c = n.injections(e.scopeName);
                      if (c) for (let e of c) r.add(new s(e));
                    })(n, this.initialScopeName, this.repo, t);
                  for (let e of t.references)
                    if (e instanceof s) {
                      if (this.seenFullScopeRequests.has(e.scopeName)) continue;
                      this.seenFullScopeRequests.add(e.scopeName),
                        this.Q.push(e);
                    } else {
                      if (
                        this.seenFullScopeRequests.has(e.scopeName) ||
                        this.seenPartialScopeRequests.has(e.toKey())
                      )
                        continue;
                      this.seenPartialScopeRequests.add(e.toKey()),
                        this.Q.push(e);
                    }
                }
              });
            class u {
              constructor() {
                this.kind = 0;
              }
            }
            t.BaseReference = u;
            class h {
              constructor() {
                this.kind = 1;
              }
            }
            t.SelfReference = h;
            class p {
              constructor(e) {
                (this.ruleName = e), (this.kind = 2);
              }
            }
            t.RelativeReference = p;
            class d {
              constructor(e) {
                (this.scopeName = e), (this.kind = 3);
              }
            }
            t.TopLevelReference = d;
            class f {
              constructor(e, t) {
                (this.scopeName = e), (this.ruleName = t), (this.kind = 4);
              }
            }
            function g(e) {
              if ('$base' === e) return new u();
              if ('$self' === e) return new h();
              let t = e.indexOf('#');
              if (-1 === t) return new d(e);
              if (0 === t) return new p(e.substring(1));
              {
                let n = e.substring(0, t),
                  r = e.substring(t + 1);
                return new f(n, r);
              }
            }
            (t.TopLevelRepositoryReference = f), (t.parseInclude = g);
          },
          391: function (e, t, n) {
            var r =
                (this && this.__createBinding) ||
                (Object.create
                  ? function (e, t, n, r) {
                      void 0 === r && (r = n),
                        Object.defineProperty(e, r, {
                          enumerable: !0,
                          get: function () {
                            return t[n];
                          },
                        });
                    }
                  : function (e, t, n, r) {
                      void 0 === r && (r = n), (e[r] = t[n]);
                    }),
              s =
                (this && this.__exportStar) ||
                function (e, t) {
                  for (var n in e)
                    'default' === n ||
                      Object.prototype.hasOwnProperty.call(t, n) ||
                      r(t, e, n);
                };
            Object.defineProperty(t, '__esModule', { value: !0 }), s(n(947), t);
          },
          47: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.LocalStackElement = t._tokenizeString = void 0);
            let r = n(350),
              s = n(44),
              a = n(792),
              i = n(878);
            class o {
              constructor(e, t) {
                (this.stack = e), (this.stoppedEarly = t);
              }
            }
            function l(e, t, n, s, l, p, d, f) {
              let g = t.content.length,
                m = !1,
                b = -1;
              if (d) {
                let i = (function (e, t, n, s, i, o) {
                  let l = i.beginRuleCapturedEOL ? 0 : -1,
                    c = [];
                  for (let t = i; t; t = t.pop()) {
                    let n = t.getRule(e);
                    n instanceof a.BeginWhileRule &&
                      c.push({ rule: n, stack: t });
                  }
                  for (let m = c.pop(); m; m = c.pop()) {
                    var p, d, f, g;
                    let { ruleScanner: c, findOptions: b } =
                        ((p = m.rule),
                        (d = m.stack.endRule),
                        (f = n),
                        (g = s === l),
                        r.UseOnigurumaFindOptions
                          ? {
                              ruleScanner: p.compileWhile(e, d),
                              findOptions: u(f, g),
                            }
                          : {
                              ruleScanner: p.compileWhileAG(e, d, f, g),
                              findOptions: 0,
                            }),
                      k = c.findNextMatchSync(t, s, b);
                    if (
                      (r.DebugFlags.InDebugMode &&
                        (console.log('  scanning for while rule'),
                        console.log(c.toString())),
                      !k)
                    ) {
                      r.DebugFlags.InDebugMode &&
                        console.log(
                          '  popping ' +
                            m.rule.debugName +
                            ' - ' +
                            m.rule.debugWhileRegExp
                        ),
                        (i = m.stack.pop());
                      break;
                    }
                    if (k.ruleId !== a.whileRuleId) {
                      i = m.stack.pop();
                      break;
                    }
                    k.captureIndices &&
                      k.captureIndices.length &&
                      (o.produce(m.stack, k.captureIndices[0].start),
                      h(
                        e,
                        t,
                        n,
                        m.stack,
                        o,
                        m.rule.whileCaptures,
                        k.captureIndices
                      ),
                      o.produce(m.stack, k.captureIndices[0].end),
                      (l = k.captureIndices[0].end),
                      k.captureIndices[0].end > s &&
                        ((s = k.captureIndices[0].end), (n = !1)));
                  }
                  return {
                    stack: i,
                    linePos: s,
                    anchorPosition: l,
                    isFirstLine: n,
                  };
                })(e, t, n, s, l, p);
                (l = i.stack),
                  (s = i.linePos),
                  (n = i.isFirstLine),
                  (b = i.anchorPosition);
              }
              let k = Date.now();
              for (; !m; ) {
                if (0 !== f && Date.now() - k > f) return new o(l, !0);
                (function () {
                  r.DebugFlags.InDebugMode &&
                    (console.log(''),
                    console.log(
                      `@@scanNext ${s}: |${t.content
                        .substr(s)
                        .replace(/\n$/, '\\n')}|`
                    ));
                  let o = (function (e, t, n, s, a, o) {
                    let l = (function (e, t, n, s, a, o) {
                        let l = a.getRule(e),
                          { ruleScanner: u, findOptions: h } = c(
                            l,
                            e,
                            a.endRule,
                            n,
                            s === o
                          ),
                          p = 0;
                        r.DebugFlags.InDebugMode && (p = i.performanceNow());
                        let d = u.findNextMatchSync(t, s, h);
                        if (r.DebugFlags.InDebugMode) {
                          let e = i.performanceNow() - p;
                          e > 5 &&
                            console.warn(
                              `Rule ${l.debugName} (${l.id}) matching took ${e} against '${t}'`
                            ),
                            console.log(
                              `  scanning for (linePos: ${s}, anchorPosition: ${o})`
                            ),
                            console.log(u.toString()),
                            d &&
                              console.log(
                                `matched rule id: ${d.ruleId} from ${d.captureIndices[0].start} to ${d.captureIndices[0].end}`
                              );
                        }
                        return d
                          ? {
                              captureIndices: d.captureIndices,
                              matchedRuleId: d.ruleId,
                            }
                          : null;
                      })(e, t, n, s, a, o),
                      u = e.getInjections();
                    if (0 === u.length) return l;
                    let h = (function (e, t, n, s, a, i, o) {
                      let l,
                        u = Number.MAX_VALUE,
                        h = null,
                        p = 0,
                        d = i.contentNameScopesList.getScopeNames();
                      for (let i = 0, f = e.length; i < f; i++) {
                        let f = e[i];
                        if (!f.matcher(d)) continue;
                        let g = t.getRule(f.ruleId),
                          { ruleScanner: m, findOptions: b } = c(
                            g,
                            t,
                            null,
                            s,
                            a === o
                          ),
                          k = m.findNextMatchSync(n, a, b);
                        if (!k) continue;
                        r.DebugFlags.InDebugMode &&
                          (console.log(
                            `  matched injection: ${f.debugSelector}`
                          ),
                          console.log(m.toString()));
                        let y = k.captureIndices[0].start;
                        if (
                          !(y >= u) &&
                          ((u = y),
                          (h = k.captureIndices),
                          (l = k.ruleId),
                          (p = f.priority),
                          u === a)
                        )
                          break;
                      }
                      return h
                        ? {
                            priorityMatch: -1 === p,
                            captureIndices: h,
                            matchedRuleId: l,
                          }
                        : null;
                    })(u, e, t, n, s, a, o);
                    if (!h) return l;
                    if (!l) return h;
                    let p = l.captureIndices[0].start,
                      d = h.captureIndices[0].start;
                    return d < p || (h.priorityMatch && d === p) ? h : l;
                  })(e, t, n, s, l, b);
                  if (!o)
                    return (
                      r.DebugFlags.InDebugMode &&
                        console.log('  no more matches.'),
                      p.produce(l, g),
                      void (m = !0)
                    );
                  let u = o.captureIndices,
                    d = o.matchedRuleId,
                    f = !!(u && u.length > 0) && u[0].end > s;
                  if (d === a.endRuleId) {
                    let a = l.getRule(e);
                    r.DebugFlags.InDebugMode &&
                      console.log(
                        '  popping ' + a.debugName + ' - ' + a.debugEndRegExp
                      ),
                      p.produce(l, u[0].start),
                      (l = l.withContentNameScopesList(l.nameScopesList)),
                      h(e, t, n, l, p, a.endCaptures, u),
                      p.produce(l, u[0].end);
                    let i = l;
                    if (
                      ((l = l.parent),
                      (b = i.getAnchorPos()),
                      !f && i.getEnterPos() === s)
                    )
                      return (
                        r.DebugFlags.InDebugMode &&
                          console.error(
                            '[1] - Grammar is in an endless loop - Grammar pushed & popped a rule without advancing'
                          ),
                        (l = i),
                        p.produce(l, g),
                        void (m = !0)
                      );
                  } else {
                    let i = e.getRule(d);
                    p.produce(l, u[0].start);
                    let o = l,
                      c = i.getName(t.content, u),
                      k = l.contentNameScopesList.pushAttributed(c, e);
                    if (
                      ((l = l.push(d, s, b, u[0].end === g, null, k, k)),
                      i instanceof a.BeginEndRule)
                    ) {
                      r.DebugFlags.InDebugMode &&
                        console.log(
                          '  pushing ' +
                            i.debugName +
                            ' - ' +
                            i.debugBeginRegExp
                        ),
                        h(e, t, n, l, p, i.beginCaptures, u),
                        p.produce(l, u[0].end),
                        (b = u[0].end);
                      let s = i.getContentName(t.content, u),
                        a = k.pushAttributed(s, e);
                      if (
                        ((l = l.withContentNameScopesList(a)),
                        i.endHasBackReferences &&
                          (l = l.withEndRule(
                            i.getEndWithResolvedBackReferences(t.content, u)
                          )),
                        !f && o.hasSameRuleAs(l))
                      )
                        return (
                          r.DebugFlags.InDebugMode &&
                            console.error(
                              '[2] - Grammar is in an endless loop - Grammar pushed the same rule without advancing'
                            ),
                          (l = l.pop()),
                          p.produce(l, g),
                          void (m = !0)
                        );
                    } else if (i instanceof a.BeginWhileRule) {
                      r.DebugFlags.InDebugMode &&
                        console.log('  pushing ' + i.debugName),
                        h(e, t, n, l, p, i.beginCaptures, u),
                        p.produce(l, u[0].end),
                        (b = u[0].end);
                      let s = i.getContentName(t.content, u),
                        a = k.pushAttributed(s, e);
                      if (
                        ((l = l.withContentNameScopesList(a)),
                        i.whileHasBackReferences &&
                          (l = l.withEndRule(
                            i.getWhileWithResolvedBackReferences(t.content, u)
                          )),
                        !f && o.hasSameRuleAs(l))
                      )
                        return (
                          r.DebugFlags.InDebugMode &&
                            console.error(
                              '[3] - Grammar is in an endless loop - Grammar pushed the same rule without advancing'
                            ),
                          (l = l.pop()),
                          p.produce(l, g),
                          void (m = !0)
                        );
                    } else if (
                      (r.DebugFlags.InDebugMode &&
                        console.log(
                          '  matched ' +
                            i.debugName +
                            ' - ' +
                            i.debugMatchRegExp
                        ),
                      h(e, t, n, l, p, i.captures, u),
                      p.produce(l, u[0].end),
                      (l = l.pop()),
                      !f)
                    )
                      return (
                        r.DebugFlags.InDebugMode &&
                          console.error(
                            '[4] - Grammar is in an endless loop - Grammar is not advancing, nor is it pushing/popping'
                          ),
                        (l = l.safePop()),
                        p.produce(l, g),
                        void (m = !0)
                      );
                  }
                  u[0].end > s && ((s = u[0].end), (n = !1));
                })();
              }
              return new o(l, !1);
            }
            function c(e, t, n, s, a) {
              return r.UseOnigurumaFindOptions
                ? { ruleScanner: e.compile(t, n), findOptions: u(s, a) }
                : { ruleScanner: e.compileAG(t, n, s, a), findOptions: 0 };
            }
            function u(e, t) {
              let n = 0;
              return e || (n |= 1), t || (n |= 4), n;
            }
            function h(e, t, n, r, a, i, o) {
              if (0 === i.length) return;
              let c = t.content,
                u = Math.min(i.length, o.length),
                h = [],
                d = o[0].end;
              for (let t = 0; t < u; t++) {
                let u = i[t];
                if (null === u) continue;
                let f = o[t];
                if (0 === f.length) continue;
                if (f.start > d) break;
                for (; h.length > 0 && h[h.length - 1].endPos <= f.start; )
                  a.produceFromScopes(
                    h[h.length - 1].scopes,
                    h[h.length - 1].endPos
                  ),
                    h.pop();
                if (
                  (h.length > 0
                    ? a.produceFromScopes(h[h.length - 1].scopes, f.start)
                    : a.produce(r, f.start),
                  u.retokenizeCapturedWithRuleId)
                ) {
                  let t = u.getName(c, o),
                    i = r.contentNameScopesList.pushAttributed(t, e),
                    h = u.getContentName(c, o),
                    p = i.pushAttributed(h, e),
                    d = r.push(
                      u.retokenizeCapturedWithRuleId,
                      f.start,
                      -1,
                      !1,
                      null,
                      i,
                      p
                    ),
                    g = e.createOnigString(c.substring(0, f.end));
                  l(e, g, n && 0 === f.start, f.start, d, a, !1, 0),
                    s.disposeOnigString(g);
                  continue;
                }
                let g = u.getName(c, o);
                if (null !== g) {
                  let t = (
                    h.length > 0
                      ? h[h.length - 1].scopes
                      : r.contentNameScopesList
                  ).pushAttributed(g, e);
                  h.push(new p(t, f.end));
                }
              }
              for (; h.length > 0; )
                a.produceFromScopes(
                  h[h.length - 1].scopes,
                  h[h.length - 1].endPos
                ),
                  h.pop();
            }
            t._tokenizeString = l;
            class p {
              constructor(e, t) {
                (this.scopes = e), (this.endPos = t);
              }
            }
            t.LocalStackElement = p;
          },
          974: (e, t) => {
            function n(e, t) {
              throw Error(
                'Near offset ' +
                  e.pos +
                  ': ' +
                  t +
                  ' ~~~' +
                  e.source.substr(e.pos, 50) +
                  '~~~'
              );
            }
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.parseJSON = void 0),
              (t.parseJSON = function (e, t, i) {
                let o = new r(e),
                  l = new s(),
                  c = 0,
                  u = null,
                  h = [],
                  p = [];
                function d() {
                  h.push(c), p.push(u);
                }
                function f() {
                  (c = h.pop()), (u = p.pop());
                }
                function g(e) {
                  n(o, e);
                }
                for (; a(o, l); ) {
                  if (0 === c) {
                    if (
                      (null !== u && g('too many constructs in root'),
                      3 === l.type)
                    ) {
                      (u = {}),
                        i && (u.$vscodeTextmateLocation = l.toLocation(t)),
                        d(),
                        (c = 1);
                      continue;
                    }
                    if (2 === l.type) {
                      (u = []), d(), (c = 4);
                      continue;
                    }
                    g('unexpected token in root');
                  }
                  if (2 === c) {
                    if (5 === l.type) {
                      f();
                      continue;
                    }
                    if (7 === l.type) {
                      c = 3;
                      continue;
                    }
                    g('expected , or }');
                  }
                  if (1 === c || 3 === c) {
                    if (1 === c && 5 === l.type) {
                      f();
                      continue;
                    }
                    if (1 === l.type) {
                      let e = l.value;
                      if (
                        ((a(o, l) && 6 === l.type) || g('expected colon'),
                        a(o, l) || g('expected value'),
                        (c = 2),
                        1 === l.type)
                      ) {
                        u[e] = l.value;
                        continue;
                      }
                      if (8 === l.type) {
                        u[e] = null;
                        continue;
                      }
                      if (9 === l.type) {
                        u[e] = !0;
                        continue;
                      }
                      if (10 === l.type) {
                        u[e] = !1;
                        continue;
                      }
                      if (11 === l.type) {
                        u[e] = parseFloat(l.value);
                        continue;
                      }
                      if (2 === l.type) {
                        let t = [];
                        (u[e] = t), d(), (c = 4), (u = t);
                        continue;
                      }
                      if (3 === l.type) {
                        let n = {};
                        i && (n.$vscodeTextmateLocation = l.toLocation(t)),
                          (u[e] = n),
                          d(),
                          (c = 1),
                          (u = n);
                        continue;
                      }
                    }
                    g('unexpected token in dict');
                  }
                  if (5 === c) {
                    if (4 === l.type) {
                      f();
                      continue;
                    }
                    if (7 === l.type) {
                      c = 6;
                      continue;
                    }
                    g('expected , or ]');
                  }
                  if (4 === c || 6 === c) {
                    if (4 === c && 4 === l.type) {
                      f();
                      continue;
                    }
                    if (((c = 5), 1 === l.type)) {
                      u.push(l.value);
                      continue;
                    }
                    if (8 === l.type) {
                      u.push(null);
                      continue;
                    }
                    if (9 === l.type) {
                      u.push(!0);
                      continue;
                    }
                    if (10 === l.type) {
                      u.push(!1);
                      continue;
                    }
                    if (11 === l.type) {
                      u.push(parseFloat(l.value));
                      continue;
                    }
                    if (2 === l.type) {
                      let e = [];
                      u.push(e), d(), (c = 4), (u = e);
                      continue;
                    }
                    if (3 === l.type) {
                      let e = {};
                      i && (e.$vscodeTextmateLocation = l.toLocation(t)),
                        u.push(e),
                        d(),
                        (c = 1),
                        (u = e);
                      continue;
                    }
                    g('unexpected token in array');
                  }
                  g('unknown state');
                }
                return 0 !== p.length && g('unclosed constructs'), u;
              });
            class r {
              constructor(e) {
                (this.source = e),
                  (this.pos = 0),
                  (this.len = e.length),
                  (this.line = 1),
                  (this.char = 0);
              }
            }
            class s {
              constructor() {
                (this.value = null),
                  (this.type = 0),
                  (this.offset = -1),
                  (this.len = -1),
                  (this.line = -1),
                  (this.char = -1);
              }
              toLocation(e) {
                return { filename: e, line: this.line, char: this.char };
              }
            }
            function a(e, t) {
              (t.value = null),
                (t.type = 0),
                (t.offset = -1),
                (t.len = -1),
                (t.line = -1),
                (t.char = -1);
              let r,
                s = e.source,
                a = e.pos,
                i = e.len,
                o = e.line,
                l = e.char;
              for (;;) {
                if (a >= i) return !1;
                if (32 !== (r = s.charCodeAt(a)) && 9 !== r && 13 !== r) {
                  if (10 !== r) break;
                  a++, o++, (l = 0);
                } else a++, l++;
              }
              if (((t.offset = a), (t.line = o), (t.char = l), 34 === r)) {
                for (t.type = 1, a++, l++; ; ) {
                  if (a >= i) return !1;
                  if (((r = s.charCodeAt(a)), a++, l++, 92 !== r)) {
                    if (34 === r) break;
                  } else a++, l++;
                }
                t.value = s
                  .substring(t.offset + 1, a - 1)
                  .replace(/\\u([0-9A-Fa-f]{4})/g, (e, t) =>
                    String.fromCodePoint(parseInt(t, 16))
                  )
                  .replace(/\\(.)/g, (t, r) => {
                    switch (r) {
                      case '"':
                        return '"';
                      case '\\':
                        return '\\';
                      case '/':
                        return '/';
                      case 'b':
                        return '\b';
                      case 'f':
                        return '\f';
                      case 'n':
                        return '\n';
                      case 'r':
                        return '\r';
                      case 't':
                        return '	';
                      default:
                        n(e, 'invalid escape sequence');
                    }
                    throw Error('unreachable');
                  });
              } else if (91 === r) (t.type = 2), a++, l++;
              else if (123 === r) (t.type = 3), a++, l++;
              else if (93 === r) (t.type = 4), a++, l++;
              else if (125 === r) (t.type = 5), a++, l++;
              else if (58 === r) (t.type = 6), a++, l++;
              else if (44 === r) (t.type = 7), a++, l++;
              else if (110 === r) {
                if (
                  ((t.type = 8),
                  a++,
                  l++,
                  117 !== (r = s.charCodeAt(a)) ||
                    (a++, l++, 108 !== (r = s.charCodeAt(a))) ||
                    (a++, l++, 108 !== (r = s.charCodeAt(a))))
                )
                  return !1;
                a++, l++;
              } else if (116 === r) {
                if (
                  ((t.type = 9),
                  a++,
                  l++,
                  114 !== (r = s.charCodeAt(a)) ||
                    (a++, l++, 117 !== (r = s.charCodeAt(a))) ||
                    (a++, l++, 101 !== (r = s.charCodeAt(a))))
                )
                  return !1;
                a++, l++;
              } else if (102 === r) {
                if (
                  ((t.type = 10),
                  a++,
                  l++,
                  97 !== (r = s.charCodeAt(a)) ||
                    (a++, l++, 108 !== (r = s.charCodeAt(a))) ||
                    (a++, l++, 115 !== (r = s.charCodeAt(a))) ||
                    (a++, l++, 101 !== (r = s.charCodeAt(a))))
                )
                  return !1;
                a++, l++;
              } else
                for (t.type = 11; ; ) {
                  if (a >= i) return !1;
                  if (
                    !(
                      46 === (r = s.charCodeAt(a)) ||
                      (r >= 48 && r <= 57) ||
                      101 === r ||
                      69 === r ||
                      45 === r ||
                      43 === r
                    )
                  )
                    break;
                  a++, l++;
                }
              return (
                (t.len = a - t.offset),
                null === t.value && (t.value = s.substr(t.offset, t.len)),
                (e.pos = a),
                (e.line = o),
                (e.char = l),
                !0
              );
            }
          },
          787: function (e, t, n) {
            var r =
                (this && this.__createBinding) ||
                (Object.create
                  ? function (e, t, n, r) {
                      void 0 === r && (r = n),
                        Object.defineProperty(e, r, {
                          enumerable: !0,
                          get: function () {
                            return t[n];
                          },
                        });
                    }
                  : function (e, t, n, r) {
                      void 0 === r && (r = n), (e[r] = t[n]);
                    }),
              s =
                (this && this.__exportStar) ||
                function (e, t) {
                  for (var n in e)
                    'default' === n ||
                      Object.prototype.hasOwnProperty.call(t, n) ||
                      r(t, e, n);
                };
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.parseRawGrammar = t.INITIAL = t.Registry = void 0);
            let a = n(391),
              i = n(50),
              o = n(652),
              l = n(583),
              c = n(965);
            s(n(44), t),
              (t.Registry = class {
                constructor(e) {
                  (this._options = e),
                    (this._syncRegistry = new o.SyncRegistry(
                      l.Theme.createFromRawTheme(e.theme, e.colorMap),
                      e.onigLib
                    )),
                    (this._ensureGrammarCache = new Map());
                }
                dispose() {
                  this._syncRegistry.dispose();
                }
                setTheme(e, t) {
                  this._syncRegistry.setTheme(l.Theme.createFromRawTheme(e, t));
                }
                getColorMap() {
                  return this._syncRegistry.getColorMap();
                }
                loadGrammarWithEmbeddedLanguages(e, t, n) {
                  return this.loadGrammarWithConfiguration(e, t, {
                    embeddedLanguages: n,
                  });
                }
                loadGrammarWithConfiguration(e, t, n) {
                  return this._loadGrammar(
                    e,
                    t,
                    n.embeddedLanguages,
                    n.tokenTypes,
                    new a.BalancedBracketSelectors(
                      n.balancedBracketSelectors || [],
                      n.unbalancedBracketSelectors || []
                    )
                  );
                }
                loadGrammar(e) {
                  return this._loadGrammar(e, 0, null, null, null);
                }
                async _loadGrammar(e, t, n, r, s) {
                  let a = new c.ScopeDependencyProcessor(this._syncRegistry, e);
                  for (; a.Q.length > 0; )
                    await Promise.all(
                      a.Q.map(e => this._loadSingleGrammar(e.scopeName))
                    ),
                      a.processQueue();
                  return this._grammarForScopeName(e, t, n, r, s);
                }
                async _loadSingleGrammar(e) {
                  return (
                    this._ensureGrammarCache.has(e) ||
                      this._ensureGrammarCache.set(
                        e,
                        this._doLoadSingleGrammar(e)
                      ),
                    this._ensureGrammarCache.get(e)
                  );
                }
                async _doLoadSingleGrammar(e) {
                  let t = await this._options.loadGrammar(e);
                  if (t) {
                    let n =
                      'function' == typeof this._options.getInjections
                        ? this._options.getInjections(e)
                        : void 0;
                    this._syncRegistry.addGrammar(t, n);
                  }
                }
                async addGrammar(e, t = [], n = 0, r = null) {
                  return (
                    this._syncRegistry.addGrammar(e, t),
                    await this._grammarForScopeName(e.scopeName, n, r)
                  );
                }
                _grammarForScopeName(e, t = 0, n = null, r = null, s = null) {
                  return this._syncRegistry.grammarForScopeName(e, t, n, r, s);
                }
              }),
              (t.INITIAL = a.StateStack.NULL),
              (t.parseRawGrammar = i.parseRawGrammar);
          },
          736: (e, t) => {
            function n(e) {
              return !!e && !!e.match(/[\w\.:]+/);
            }
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.createMatchers = void 0),
              (t.createMatchers = function (e, t) {
                let r, s;
                let a = [],
                  i =
                    ((s = (r = /([LR]:|[\w\.:][\w\.:\-]*|[\,\|\-\(\)])/g).exec(
                      e
                    )),
                    {
                      next: () => {
                        if (!s) return null;
                        let t = s[0];
                        return (s = r.exec(e)), t;
                      },
                    }),
                  o = i.next();
                for (; null !== o; ) {
                  let e = 0;
                  if (2 === o.length && ':' === o.charAt(1)) {
                    switch (o.charAt(0)) {
                      case 'R':
                        e = 1;
                        break;
                      case 'L':
                        e = -1;
                        break;
                      default:
                        console.log(`Unknown priority ${o} in scope selector`);
                    }
                    o = i.next();
                  }
                  let t = c();
                  if ((a.push({ matcher: t, priority: e }), ',' !== o)) break;
                  o = i.next();
                }
                return a;
                function l() {
                  if ('-' === o) {
                    o = i.next();
                    let e = l();
                    return t => !!e && !e(t);
                  }
                  if ('(' === o) {
                    o = i.next();
                    let e = (function () {
                      let e = [],
                        t = c();
                      for (; t && (e.push(t), '|' === o || ',' === o); ) {
                        do o = i.next();
                        while ('|' === o || ',' === o);
                        t = c();
                      }
                      return t => e.some(e => e(t));
                    })();
                    return ')' === o && (o = i.next()), e;
                  }
                  if (n(o)) {
                    let e = [];
                    do e.push(o), (o = i.next());
                    while (n(o));
                    return n => t(e, n);
                  }
                  return null;
                }
                function c() {
                  let e = [],
                    t = l();
                  for (; t; ) e.push(t), (t = l());
                  return t => e.every(e => e(t));
                }
              });
          },
          44: (e, t) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.disposeOnigString = void 0),
              (t.disposeOnigString = function (e) {
                'function' == typeof e.dispose && e.dispose();
              });
          },
          50: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.parseRawGrammar = void 0);
            let r = n(69),
              s = n(350),
              a = n(974);
            t.parseRawGrammar = function (e, t = null) {
              return null !== t && /\.json$/.test(t)
                ? s.DebugFlags.InDebugMode
                  ? a.parseJSON(e, t, !0)
                  : JSON.parse(e)
                : s.DebugFlags.InDebugMode
                ? r.parseWithLocation(e, t, '$vscodeTextmateLocation')
                : r.parsePLIST(e);
            };
          },
          69: (e, t) => {
            function n(e, t, n) {
              var r;
              let s = e.length,
                a = 0,
                i = 1,
                o = 0;
              function l(t) {
                if (null === n) a += t;
                else
                  for (; t > 0; )
                    10 === e.charCodeAt(a) ? (a++, i++, (o = 0)) : (a++, o++),
                      t--;
              }
              function c(e) {
                null === n ? (a = e) : l(e - a);
              }
              function u() {
                for (; a < s; ) {
                  let t = e.charCodeAt(a);
                  if (32 !== t && 9 !== t && 13 !== t && 10 !== t) break;
                  l(1);
                }
              }
              function h(t) {
                return e.substr(a, t.length) === t && (l(t.length), !0);
              }
              function p(t) {
                let n = e.indexOf(t, a);
                c(-1 !== n ? n + t.length : s);
              }
              function d(t) {
                let n = e.indexOf(t, a);
                if (-1 !== n) {
                  let r = e.substring(a, n);
                  return c(n + t.length), r;
                }
                {
                  let t = e.substr(a);
                  return c(s), t;
                }
              }
              s > 0 && 65279 === e.charCodeAt(0) && (a = 1);
              let f = 0,
                g = null,
                m = [],
                b = [],
                k = null;
              function y(e, t) {
                m.push(f), b.push(g), (f = e), (g = t);
              }
              function _() {
                if (0 === m.length) return x('illegal state stack');
                (f = m.pop()), (g = b.pop());
              }
              function x(t) {
                throw Error(
                  'Near offset ' +
                    a +
                    ': ' +
                    t +
                    ' ~~~' +
                    e.substr(a, 50) +
                    '~~~'
                );
              }
              function w() {
                if (1 !== f) return x('unexpected </dict>');
                _();
              }
              function S() {
                return 1 === f || 2 !== f ? x('unexpected </array>') : void _();
              }
              function v(e) {
                if (1 === f) {
                  if (null === k) return x('missing <key>');
                  (g[k] = e), (k = null);
                } else 2 === f ? g.push(e) : (g = e);
              }
              function C(e) {
                if (e.isClosed) return '';
                let t = d('</');
                return (
                  p('>'),
                  t
                    .replace(/&#([0-9]+);/g, function (e, t) {
                      return String.fromCodePoint(parseInt(t, 10));
                    })
                    .replace(/&#x([0-9a-f]+);/g, function (e, t) {
                      return String.fromCodePoint(parseInt(t, 16));
                    })
                    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, function (e) {
                      switch (e) {
                        case '&amp;':
                          return '&';
                        case '&lt;':
                          return '<';
                        case '&gt;':
                          return '>';
                        case '&quot;':
                          return '"';
                        case '&apos;':
                          return "'";
                      }
                      return e;
                    })
                );
              }
              for (; a < s && (u(), !(a >= s)); ) {
                let c = e.charCodeAt(a);
                if ((l(1), 60 !== c)) return x('expected <');
                if (a >= s) return x('unexpected end of input');
                let m = e.charCodeAt(a);
                if (63 === m) {
                  l(1), p('?>');
                  continue;
                }
                if (33 === m) {
                  if ((l(1), h('--'))) {
                    p('-->');
                    continue;
                  }
                  p('>');
                  continue;
                }
                if (47 === m) {
                  if ((l(1), u(), h('plist'))) {
                    p('>');
                    continue;
                  }
                  if (h('dict')) {
                    p('>'), w();
                    continue;
                  }
                  if (h('array')) {
                    p('>'), S();
                    continue;
                  }
                  return x('unexpected closed tag');
                }
                let b = (function () {
                  let e = d('>'),
                    t = !1;
                  return (
                    47 === e.charCodeAt(e.length - 1) &&
                      ((t = !0), (e = e.substring(0, e.length - 1))),
                    { name: e.trim(), isClosed: t }
                  );
                })();
                switch (b.name) {
                  case 'dict':
                    1 === f
                      ? (function () {
                          if (null === k) return x('missing <key>');
                          let e = {};
                          null !== n &&
                            (e[n] = { filename: t, line: i, char: o }),
                            (g[k] = e),
                            (k = null),
                            y(1, e);
                        })()
                      : 2 === f
                      ? (function () {
                          let e = {};
                          null !== n &&
                            (e[n] = { filename: t, line: i, char: o }),
                            g.push(e),
                            y(1, e);
                        })()
                      : ((g = {}),
                        null !== n &&
                          (g[n] = { filename: t, line: i, char: o }),
                        y(1, g)),
                      b.isClosed && w();
                    continue;
                  case 'array':
                    1 === f
                      ? (function () {
                          if (null === k) return x('missing <key>');
                          let e = [];
                          (g[k] = e), (k = null), y(2, e);
                        })()
                      : 2 === f
                      ? (function () {
                          let e = [];
                          g.push(e), y(2, e);
                        })()
                      : y(2, (g = [])),
                      b.isClosed && S();
                    continue;
                  case 'key':
                    (r = C(b)),
                      1 !== f
                        ? x('unexpected <key>')
                        : null !== k
                        ? x('too many <key>')
                        : (k = r);
                    continue;
                  case 'string':
                    !(function (e) {
                      if (1 === f) {
                        if (null === k) return x('missing <key>');
                        (g[k] = e), (k = null);
                      } else 2 === f ? g.push(e) : (g = e);
                    })(C(b));
                    continue;
                  case 'real':
                    !(function (e) {
                      if (isNaN(e)) return x('cannot parse float');
                      if (1 === f) {
                        if (null === k) return x('missing <key>');
                        (g[k] = e), (k = null);
                      } else 2 === f ? g.push(e) : (g = e);
                    })(parseFloat(C(b)));
                    continue;
                  case 'integer':
                    !(function (e) {
                      if (isNaN(e)) return x('cannot parse integer');
                      if (1 === f) {
                        if (null === k) return x('missing <key>');
                        (g[k] = e), (k = null);
                      } else 2 === f ? g.push(e) : (g = e);
                    })(parseInt(C(b), 10));
                    continue;
                  case 'date':
                    !(function (e) {
                      if (1 === f) {
                        if (null === k) return x('missing <key>');
                        (g[k] = e), (k = null);
                      } else 2 === f ? g.push(e) : (g = e);
                    })(new Date(C(b)));
                    continue;
                  case 'data':
                    !(function (e) {
                      if (1 === f) {
                        if (null === k) return x('missing <key>');
                        (g[k] = e), (k = null);
                      } else 2 === f ? g.push(e) : (g = e);
                    })(C(b));
                    continue;
                  case 'true':
                    C(b), v(!0);
                    continue;
                  case 'false':
                    C(b), v(!1);
                    continue;
                }
                if (!/^plist/.test(b.name))
                  return x('unexpected opened tag ' + b.name);
              }
              return g;
            }
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.parsePLIST = t.parseWithLocation = void 0),
              (t.parseWithLocation = function (e, t, r) {
                return n(e, t, r);
              }),
              (t.parsePLIST = function (e) {
                return n(e, null, null);
              });
          },
          652: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.SyncRegistry = void 0);
            let r = n(391);
            t.SyncRegistry = class {
              constructor(e, t) {
                (this._onigLibPromise = t),
                  (this._grammars = new Map()),
                  (this._rawGrammars = new Map()),
                  (this._injectionGrammars = new Map()),
                  (this._theme = e);
              }
              dispose() {
                for (let e of this._grammars.values()) e.dispose();
              }
              setTheme(e) {
                this._theme = e;
              }
              getColorMap() {
                return this._theme.getColorMap();
              }
              addGrammar(e, t) {
                this._rawGrammars.set(e.scopeName, e),
                  t && this._injectionGrammars.set(e.scopeName, t);
              }
              lookup(e) {
                return this._rawGrammars.get(e);
              }
              injections(e) {
                return this._injectionGrammars.get(e);
              }
              getDefaults() {
                return this._theme.getDefaults();
              }
              themeMatch(e) {
                return this._theme.match(e);
              }
              async grammarForScopeName(e, t, n, s, a) {
                if (!this._grammars.has(e)) {
                  let i = this._rawGrammars.get(e);
                  if (!i) return null;
                  this._grammars.set(
                    e,
                    r.createGrammar(
                      e,
                      i,
                      t,
                      n,
                      s,
                      a,
                      this,
                      await this._onigLibPromise
                    )
                  );
                }
                return this._grammars.get(e);
              }
            };
          },
          792: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.CompiledRule =
                t.RegExpSourceList =
                t.RegExpSource =
                t.RuleFactory =
                t.BeginWhileRule =
                t.BeginEndRule =
                t.IncludeOnlyRule =
                t.MatchRule =
                t.CaptureRule =
                t.Rule =
                t.ruleIdToNumber =
                t.ruleIdFromNumber =
                t.whileRuleId =
                t.endRuleId =
                  void 0);
            let r = n(878),
              s = n(965),
              a = /\\(\d+)/,
              i = /\\(\d+)/g;
            Symbol('RuleId'),
              (t.endRuleId = -1),
              (t.whileRuleId = -2),
              (t.ruleIdFromNumber = function (e) {
                return e;
              }),
              (t.ruleIdToNumber = function (e) {
                return e;
              });
            class o {
              constructor(e, t, n, s) {
                (this.$location = e),
                  (this.id = t),
                  (this._name = n || null),
                  (this._nameIsCapturing = r.RegexSource.hasCaptures(
                    this._name
                  )),
                  (this._contentName = s || null),
                  (this._contentNameIsCapturing = r.RegexSource.hasCaptures(
                    this._contentName
                  ));
              }
              get debugName() {
                let e = this.$location
                  ? `${r.basename(this.$location.filename)}:${
                      this.$location.line
                    }`
                  : 'unknown';
                return `${this.constructor.name}#${this.id} @ ${e}`;
              }
              getName(e, t) {
                return this._nameIsCapturing &&
                  null !== this._name &&
                  null !== e &&
                  null !== t
                  ? r.RegexSource.replaceCaptures(this._name, e, t)
                  : this._name;
              }
              getContentName(e, t) {
                return this._contentNameIsCapturing &&
                  null !== this._contentName
                  ? r.RegexSource.replaceCaptures(this._contentName, e, t)
                  : this._contentName;
              }
            }
            t.Rule = o;
            class l extends o {
              constructor(e, t, n, r, s) {
                super(e, t, n, r), (this.retokenizeCapturedWithRuleId = s);
              }
              dispose() {}
              collectPatterns(e, t) {
                throw Error('Not supported!');
              }
              compile(e, t) {
                throw Error('Not supported!');
              }
              compileAG(e, t, n, r) {
                throw Error('Not supported!');
              }
            }
            t.CaptureRule = l;
            class c extends o {
              constructor(e, t, n, r, s) {
                super(e, t, n, null),
                  (this._match = new f(r, this.id)),
                  (this.captures = s),
                  (this._cachedCompiledPatterns = null);
              }
              dispose() {
                this._cachedCompiledPatterns &&
                  (this._cachedCompiledPatterns.dispose(),
                  (this._cachedCompiledPatterns = null));
              }
              get debugMatchRegExp() {
                return `${this._match.source}`;
              }
              collectPatterns(e, t) {
                t.push(this._match);
              }
              compile(e, t) {
                return this._getCachedCompiledPatterns(e).compile(e);
              }
              compileAG(e, t, n, r) {
                return this._getCachedCompiledPatterns(e).compileAG(e, n, r);
              }
              _getCachedCompiledPatterns(e) {
                return (
                  this._cachedCompiledPatterns ||
                    ((this._cachedCompiledPatterns = new g()),
                    this.collectPatterns(e, this._cachedCompiledPatterns)),
                  this._cachedCompiledPatterns
                );
              }
            }
            t.MatchRule = c;
            class u extends o {
              constructor(e, t, n, r, s) {
                super(e, t, n, r),
                  (this.patterns = s.patterns),
                  (this.hasMissingPatterns = s.hasMissingPatterns),
                  (this._cachedCompiledPatterns = null);
              }
              dispose() {
                this._cachedCompiledPatterns &&
                  (this._cachedCompiledPatterns.dispose(),
                  (this._cachedCompiledPatterns = null));
              }
              collectPatterns(e, t) {
                for (let n of this.patterns) e.getRule(n).collectPatterns(e, t);
              }
              compile(e, t) {
                return this._getCachedCompiledPatterns(e).compile(e);
              }
              compileAG(e, t, n, r) {
                return this._getCachedCompiledPatterns(e).compileAG(e, n, r);
              }
              _getCachedCompiledPatterns(e) {
                return (
                  this._cachedCompiledPatterns ||
                    ((this._cachedCompiledPatterns = new g()),
                    this.collectPatterns(e, this._cachedCompiledPatterns)),
                  this._cachedCompiledPatterns
                );
              }
            }
            t.IncludeOnlyRule = u;
            class h extends o {
              constructor(e, t, n, r, s, a, i, o, l, c) {
                super(e, t, n, r),
                  (this._begin = new f(s, this.id)),
                  (this.beginCaptures = a),
                  (this._end = new f(i || '￿', -1)),
                  (this.endHasBackReferences = this._end.hasBackReferences),
                  (this.endCaptures = o),
                  (this.applyEndPatternLast = l || !1),
                  (this.patterns = c.patterns),
                  (this.hasMissingPatterns = c.hasMissingPatterns),
                  (this._cachedCompiledPatterns = null);
              }
              dispose() {
                this._cachedCompiledPatterns &&
                  (this._cachedCompiledPatterns.dispose(),
                  (this._cachedCompiledPatterns = null));
              }
              get debugBeginRegExp() {
                return `${this._begin.source}`;
              }
              get debugEndRegExp() {
                return `${this._end.source}`;
              }
              getEndWithResolvedBackReferences(e, t) {
                return this._end.resolveBackReferences(e, t);
              }
              collectPatterns(e, t) {
                t.push(this._begin);
              }
              compile(e, t) {
                return this._getCachedCompiledPatterns(e, t).compile(e);
              }
              compileAG(e, t, n, r) {
                return this._getCachedCompiledPatterns(e, t).compileAG(e, n, r);
              }
              _getCachedCompiledPatterns(e, t) {
                if (!this._cachedCompiledPatterns) {
                  for (let t of ((this._cachedCompiledPatterns = new g()),
                  this.patterns))
                    e.getRule(t).collectPatterns(
                      e,
                      this._cachedCompiledPatterns
                    );
                  this.applyEndPatternLast
                    ? this._cachedCompiledPatterns.push(
                        this._end.hasBackReferences
                          ? this._end.clone()
                          : this._end
                      )
                    : this._cachedCompiledPatterns.unshift(
                        this._end.hasBackReferences
                          ? this._end.clone()
                          : this._end
                      );
                }
                return (
                  this._end.hasBackReferences &&
                    (this.applyEndPatternLast
                      ? this._cachedCompiledPatterns.setSource(
                          this._cachedCompiledPatterns.length() - 1,
                          t
                        )
                      : this._cachedCompiledPatterns.setSource(0, t)),
                  this._cachedCompiledPatterns
                );
              }
            }
            t.BeginEndRule = h;
            class p extends o {
              constructor(e, n, r, s, a, i, o, l, c) {
                super(e, n, r, s),
                  (this._begin = new f(a, this.id)),
                  (this.beginCaptures = i),
                  (this.whileCaptures = l),
                  (this._while = new f(o, t.whileRuleId)),
                  (this.whileHasBackReferences = this._while.hasBackReferences),
                  (this.patterns = c.patterns),
                  (this.hasMissingPatterns = c.hasMissingPatterns),
                  (this._cachedCompiledPatterns = null),
                  (this._cachedCompiledWhilePatterns = null);
              }
              dispose() {
                this._cachedCompiledPatterns &&
                  (this._cachedCompiledPatterns.dispose(),
                  (this._cachedCompiledPatterns = null)),
                  this._cachedCompiledWhilePatterns &&
                    (this._cachedCompiledWhilePatterns.dispose(),
                    (this._cachedCompiledWhilePatterns = null));
              }
              get debugBeginRegExp() {
                return `${this._begin.source}`;
              }
              get debugWhileRegExp() {
                return `${this._while.source}`;
              }
              getWhileWithResolvedBackReferences(e, t) {
                return this._while.resolveBackReferences(e, t);
              }
              collectPatterns(e, t) {
                t.push(this._begin);
              }
              compile(e, t) {
                return this._getCachedCompiledPatterns(e).compile(e);
              }
              compileAG(e, t, n, r) {
                return this._getCachedCompiledPatterns(e).compileAG(e, n, r);
              }
              _getCachedCompiledPatterns(e) {
                if (!this._cachedCompiledPatterns)
                  for (let t of ((this._cachedCompiledPatterns = new g()),
                  this.patterns))
                    e.getRule(t).collectPatterns(
                      e,
                      this._cachedCompiledPatterns
                    );
                return this._cachedCompiledPatterns;
              }
              compileWhile(e, t) {
                return this._getCachedCompiledWhilePatterns(e, t).compile(e);
              }
              compileWhileAG(e, t, n, r) {
                return this._getCachedCompiledWhilePatterns(e, t).compileAG(
                  e,
                  n,
                  r
                );
              }
              _getCachedCompiledWhilePatterns(e, t) {
                return (
                  this._cachedCompiledWhilePatterns ||
                    ((this._cachedCompiledWhilePatterns = new g()),
                    this._cachedCompiledWhilePatterns.push(
                      this._while.hasBackReferences
                        ? this._while.clone()
                        : this._while
                    )),
                  this._while.hasBackReferences &&
                    this._cachedCompiledWhilePatterns.setSource(0, t || '￿'),
                  this._cachedCompiledWhilePatterns
                );
              }
            }
            t.BeginWhileRule = p;
            class d {
              static createCaptureRule(e, t, n, r, s) {
                return e.registerRule(e => new l(t, e, n, r, s));
              }
              static getCompiledRuleId(e, t, n) {
                return (
                  e.id ||
                    t.registerRule(s => {
                      if (((e.id = s), e.match))
                        return new c(
                          e.$vscodeTextmateLocation,
                          e.id,
                          e.name,
                          e.match,
                          d._compileCaptures(e.captures, t, n)
                        );
                      if (void 0 === e.begin) {
                        e.repository &&
                          (n = r.mergeObjects({}, n, e.repository));
                        let s = e.patterns;
                        return (
                          void 0 === s &&
                            e.include &&
                            (s = [{ include: e.include }]),
                          new u(
                            e.$vscodeTextmateLocation,
                            e.id,
                            e.name,
                            e.contentName,
                            d._compilePatterns(s, t, n)
                          )
                        );
                      }
                      return e.while
                        ? new p(
                            e.$vscodeTextmateLocation,
                            e.id,
                            e.name,
                            e.contentName,
                            e.begin,
                            d._compileCaptures(
                              e.beginCaptures || e.captures,
                              t,
                              n
                            ),
                            e.while,
                            d._compileCaptures(
                              e.whileCaptures || e.captures,
                              t,
                              n
                            ),
                            d._compilePatterns(e.patterns, t, n)
                          )
                        : new h(
                            e.$vscodeTextmateLocation,
                            e.id,
                            e.name,
                            e.contentName,
                            e.begin,
                            d._compileCaptures(
                              e.beginCaptures || e.captures,
                              t,
                              n
                            ),
                            e.end,
                            d._compileCaptures(
                              e.endCaptures || e.captures,
                              t,
                              n
                            ),
                            e.applyEndPatternLast,
                            d._compilePatterns(e.patterns, t, n)
                          );
                    }),
                  e.id
                );
              }
              static _compileCaptures(e, t, n) {
                let r = [];
                if (e) {
                  let s = 0;
                  for (let t in e) {
                    if ('$vscodeTextmateLocation' === t) continue;
                    let e = parseInt(t, 10);
                    e > s && (s = e);
                  }
                  for (let e = 0; e <= s; e++) r[e] = null;
                  for (let s in e) {
                    if ('$vscodeTextmateLocation' === s) continue;
                    let a = parseInt(s, 10),
                      i = 0;
                    e[s].patterns && (i = d.getCompiledRuleId(e[s], t, n)),
                      (r[a] = d.createCaptureRule(
                        t,
                        e[s].$vscodeTextmateLocation,
                        e[s].name,
                        e[s].contentName,
                        i
                      ));
                  }
                }
                return r;
              }
              static _compilePatterns(e, t, n) {
                let r = [];
                if (e)
                  for (let a = 0, i = e.length; a < i; a++) {
                    let i = e[a],
                      o = -1;
                    if (i.include) {
                      let e = s.parseInclude(i.include);
                      switch (e.kind) {
                        case 0:
                        case 1:
                          o = d.getCompiledRuleId(n[i.include], t, n);
                          break;
                        case 2:
                          let r = n[e.ruleName];
                          r && (o = d.getCompiledRuleId(r, t, n));
                          break;
                        case 3:
                        case 4:
                          let a = e.scopeName,
                            l = 4 === e.kind ? e.ruleName : null,
                            c = t.getExternalGrammar(a, n);
                          if (c) {
                            if (l) {
                              let e = c.repository[l];
                              e &&
                                (o = d.getCompiledRuleId(e, t, c.repository));
                            } else
                              o = d.getCompiledRuleId(
                                c.repository.$self,
                                t,
                                c.repository
                              );
                          }
                      }
                    } else o = d.getCompiledRuleId(i, t, n);
                    if (-1 !== o) {
                      let e = t.getRule(o),
                        n = !1;
                      if (
                        ((e instanceof u || e instanceof h || e instanceof p) &&
                          e.hasMissingPatterns &&
                          0 === e.patterns.length &&
                          (n = !0),
                        n)
                      )
                        continue;
                      r.push(o);
                    }
                  }
                return {
                  patterns: r,
                  hasMissingPatterns: (e ? e.length : 0) !== r.length,
                };
              }
            }
            t.RuleFactory = d;
            class f {
              constructor(e, t) {
                if (e) {
                  let t = e.length,
                    n = 0,
                    r = [],
                    s = !1;
                  for (let a = 0; a < t; a++)
                    if ('\\' === e.charAt(a) && a + 1 < t) {
                      let t = e.charAt(a + 1);
                      'z' === t
                        ? (r.push(e.substring(n, a)),
                          r.push('$(?!\\n)(?<!\\n)'),
                          (n = a + 2))
                        : ('A' !== t && 'G' !== t) || (s = !0),
                        a++;
                    }
                  (this.hasAnchor = s),
                    0 === n
                      ? (this.source = e)
                      : (r.push(e.substring(n, t)), (this.source = r.join('')));
                } else (this.hasAnchor = !1), (this.source = e);
                this.hasAnchor
                  ? (this._anchorCache = this._buildAnchorCache())
                  : (this._anchorCache = null),
                  (this.ruleId = t),
                  (this.hasBackReferences = a.test(this.source));
              }
              clone() {
                return new f(this.source, this.ruleId);
              }
              setSource(e) {
                this.source !== e &&
                  ((this.source = e),
                  this.hasAnchor &&
                    (this._anchorCache = this._buildAnchorCache()));
              }
              resolveBackReferences(e, t) {
                let n = t.map(t => e.substring(t.start, t.end));
                return (
                  (i.lastIndex = 0),
                  this.source.replace(i, (e, t) =>
                    r.escapeRegExpCharacters(n[parseInt(t, 10)] || '')
                  )
                );
              }
              _buildAnchorCache() {
                let e,
                  t,
                  n,
                  r,
                  s = [],
                  a = [],
                  i = [],
                  o = [];
                for (e = 0, t = this.source.length; e < t; e++)
                  (n = this.source.charAt(e)),
                    (s[e] = n),
                    (a[e] = n),
                    (i[e] = n),
                    (o[e] = n),
                    '\\' === n &&
                      e + 1 < t &&
                      ('A' === (r = this.source.charAt(e + 1))
                        ? ((s[e + 1] = '￿'),
                          (a[e + 1] = '￿'),
                          (i[e + 1] = 'A'),
                          (o[e + 1] = 'A'))
                        : 'G' === r
                        ? ((s[e + 1] = '￿'),
                          (a[e + 1] = 'G'),
                          (i[e + 1] = '￿'),
                          (o[e + 1] = 'G'))
                        : ((s[e + 1] = r),
                          (a[e + 1] = r),
                          (i[e + 1] = r),
                          (o[e + 1] = r)),
                      e++);
                return {
                  A0_G0: s.join(''),
                  A0_G1: a.join(''),
                  A1_G0: i.join(''),
                  A1_G1: o.join(''),
                };
              }
              resolveAnchors(e, t) {
                return this.hasAnchor && this._anchorCache
                  ? e
                    ? t
                      ? this._anchorCache.A1_G1
                      : this._anchorCache.A1_G0
                    : t
                    ? this._anchorCache.A0_G1
                    : this._anchorCache.A0_G0
                  : this.source;
              }
            }
            t.RegExpSource = f;
            class g {
              constructor() {
                (this._items = []),
                  (this._hasAnchors = !1),
                  (this._cached = null),
                  (this._anchorCache = {
                    A0_G0: null,
                    A0_G1: null,
                    A1_G0: null,
                    A1_G1: null,
                  });
              }
              dispose() {
                this._disposeCaches();
              }
              _disposeCaches() {
                this._cached && (this._cached.dispose(), (this._cached = null)),
                  this._anchorCache.A0_G0 &&
                    (this._anchorCache.A0_G0.dispose(),
                    (this._anchorCache.A0_G0 = null)),
                  this._anchorCache.A0_G1 &&
                    (this._anchorCache.A0_G1.dispose(),
                    (this._anchorCache.A0_G1 = null)),
                  this._anchorCache.A1_G0 &&
                    (this._anchorCache.A1_G0.dispose(),
                    (this._anchorCache.A1_G0 = null)),
                  this._anchorCache.A1_G1 &&
                    (this._anchorCache.A1_G1.dispose(),
                    (this._anchorCache.A1_G1 = null));
              }
              push(e) {
                this._items.push(e),
                  (this._hasAnchors = this._hasAnchors || e.hasAnchor);
              }
              unshift(e) {
                this._items.unshift(e),
                  (this._hasAnchors = this._hasAnchors || e.hasAnchor);
              }
              length() {
                return this._items.length;
              }
              setSource(e, t) {
                this._items[e].source !== t &&
                  (this._disposeCaches(), this._items[e].setSource(t));
              }
              compile(e) {
                if (!this._cached) {
                  let t = this._items.map(e => e.source);
                  this._cached = new m(
                    e,
                    t,
                    this._items.map(e => e.ruleId)
                  );
                }
                return this._cached;
              }
              compileAG(e, t, n) {
                return this._hasAnchors
                  ? t
                    ? n
                      ? (this._anchorCache.A1_G1 ||
                          (this._anchorCache.A1_G1 = this._resolveAnchors(
                            e,
                            t,
                            n
                          )),
                        this._anchorCache.A1_G1)
                      : (this._anchorCache.A1_G0 ||
                          (this._anchorCache.A1_G0 = this._resolveAnchors(
                            e,
                            t,
                            n
                          )),
                        this._anchorCache.A1_G0)
                    : n
                    ? (this._anchorCache.A0_G1 ||
                        (this._anchorCache.A0_G1 = this._resolveAnchors(
                          e,
                          t,
                          n
                        )),
                      this._anchorCache.A0_G1)
                    : (this._anchorCache.A0_G0 ||
                        (this._anchorCache.A0_G0 = this._resolveAnchors(
                          e,
                          t,
                          n
                        )),
                      this._anchorCache.A0_G0)
                  : this.compile(e);
              }
              _resolveAnchors(e, t, n) {
                let r = this._items.map(e => e.resolveAnchors(t, n));
                return new m(
                  e,
                  r,
                  this._items.map(e => e.ruleId)
                );
              }
            }
            t.RegExpSourceList = g;
            class m {
              constructor(e, t, n) {
                (this.regExps = t),
                  (this.rules = n),
                  (this.scanner = e.createOnigScanner(t));
              }
              dispose() {
                'function' == typeof this.scanner.dispose &&
                  this.scanner.dispose();
              }
              toString() {
                let e = [];
                for (let t = 0, n = this.rules.length; t < n; t++)
                  e.push('   - ' + this.rules[t] + ': ' + this.regExps[t]);
                return e.join('\n');
              }
              findNextMatchSync(e, t, n) {
                let r = this.scanner.findNextMatchSync(e, t, n);
                return r
                  ? {
                      ruleId: this.rules[r.index],
                      captureIndices: r.captureIndices,
                    }
                  : null;
              }
            }
            t.CompiledRule = m;
          },
          583: (e, t, n) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.ThemeTrieElement =
                t.ThemeTrieElementRule =
                t.ColorMap =
                t.fontStyleToString =
                t.ParsedThemeRule =
                t.parseTheme =
                t.StyleAttributes =
                t.ScopeStack =
                t.Theme =
                  void 0);
            let r = n(878);
            class s {
              constructor(e, t, n) {
                (this._colorMap = e),
                  (this._defaults = t),
                  (this._root = n),
                  (this._cachedMatchRoot = new r.CachedFn(e =>
                    this._root.match(e)
                  ));
              }
              static createFromRawTheme(e, t) {
                return this.createFromParsedTheme(o(e), t);
              }
              static createFromParsedTheme(e, t) {
                return (function (e, t) {
                  e.sort((e, t) => {
                    let n = r.strcmp(e.scope, t.scope);
                    return 0 !== n
                      ? n
                      : 0 !== (n = r.strArrCmp(e.parentScopes, t.parentScopes))
                      ? n
                      : e.index - t.index;
                  });
                  let n = 0,
                    a = '#000000',
                    o = '#ffffff';
                  for (; e.length >= 1 && '' === e[0].scope; ) {
                    let t = e.shift();
                    -1 !== t.fontStyle && (n = t.fontStyle),
                      null !== t.foreground && (a = t.foreground),
                      null !== t.background && (o = t.background);
                  }
                  let l = new c(t),
                    p = new i(n, l.getId(a), l.getId(o)),
                    d = new h(new u(0, null, -1, 0, 0), []);
                  for (let t = 0, n = e.length; t < n; t++) {
                    let n = e[t];
                    d.insert(
                      0,
                      n.scope,
                      n.parentScopes,
                      n.fontStyle,
                      l.getId(n.foreground),
                      l.getId(n.background)
                    );
                  }
                  return new s(l, p, d);
                })(e, t);
              }
              getColorMap() {
                return this._colorMap.getColorMap();
              }
              getDefaults() {
                return this._defaults;
              }
              match(e) {
                if (null === e) return this._defaults;
                let t = e.scopeName,
                  n = this._cachedMatchRoot.get(t).find(t =>
                    (function (e, t) {
                      if (null === t) return !0;
                      let n = 0,
                        r = t[0];
                      for (; e; ) {
                        var s, a;
                        if (
                          ((s = e.scopeName),
                          (a = r) === s ||
                            (s.startsWith(a) && '.' === s[a.length]))
                        ) {
                          if (++n === t.length) return !0;
                          r = t[n];
                        }
                        e = e.parent;
                      }
                      return !1;
                    })(e.parent, t.parentScopes)
                  );
                return n
                  ? new i(n.fontStyle, n.foreground, n.background)
                  : null;
              }
            }
            t.Theme = s;
            class a {
              constructor(e, t) {
                (this.parent = e), (this.scopeName = t);
              }
              static from(...e) {
                let t = null;
                for (let n = 0; n < e.length; n++) t = new a(t, e[n]);
                return t;
              }
              push(e) {
                return new a(this, e);
              }
              getSegments() {
                let e = this,
                  t = [];
                for (; e; ) t.push(e.scopeName), (e = e.parent);
                return t.reverse(), t;
              }
              toString() {
                return this.getSegments().join(' ');
              }
            }
            t.ScopeStack = a;
            class i {
              constructor(e, t, n) {
                (this.fontStyle = e),
                  (this.foregroundId = t),
                  (this.backgroundId = n);
              }
            }
            function o(e) {
              if (!e || !e.settings || !Array.isArray(e.settings)) return [];
              let t = e.settings,
                n = [],
                s = 0;
              for (let e = 0, a = t.length; e < a; e++) {
                let a,
                  i = t[e];
                if (!i.settings) continue;
                if ('string' == typeof i.scope) {
                  let e = i.scope;
                  a = (e = (e = e.replace(/^[,]+/, '')).replace(
                    /[,]+$/,
                    ''
                  )).split(',');
                } else a = Array.isArray(i.scope) ? i.scope : [''];
                let o = -1;
                if ('string' == typeof i.settings.fontStyle) {
                  o = 0;
                  let e = i.settings.fontStyle.split(' ');
                  for (let t = 0, n = e.length; t < n; t++)
                    switch (e[t]) {
                      case 'italic':
                        o |= 1;
                        break;
                      case 'bold':
                        o |= 2;
                        break;
                      case 'underline':
                        o |= 4;
                        break;
                      case 'strikethrough':
                        o |= 8;
                    }
                }
                let c = null;
                'string' == typeof i.settings.foreground &&
                  r.isValidHexColor(i.settings.foreground) &&
                  (c = i.settings.foreground);
                let u = null;
                'string' == typeof i.settings.background &&
                  r.isValidHexColor(i.settings.background) &&
                  (u = i.settings.background);
                for (let t = 0, r = a.length; t < r; t++) {
                  let r = a[t].trim().split(' '),
                    i = r[r.length - 1],
                    h = null;
                  r.length > 1 && (h = r.slice(0, r.length - 1)).reverse(),
                    (n[s++] = new l(i, h, e, o, c, u));
                }
              }
              return n;
            }
            (t.StyleAttributes = i), (t.parseTheme = o);
            class l {
              constructor(e, t, n, r, s, a) {
                (this.scope = e),
                  (this.parentScopes = t),
                  (this.index = n),
                  (this.fontStyle = r),
                  (this.foreground = s),
                  (this.background = a);
              }
            }
            (t.ParsedThemeRule = l),
              (t.fontStyleToString = function (e) {
                if (-1 === e) return 'not set';
                let t = '';
                return (
                  1 & e && (t += 'italic '),
                  2 & e && (t += 'bold '),
                  4 & e && (t += 'underline '),
                  8 & e && (t += 'strikethrough '),
                  '' === t && (t = 'none'),
                  t.trim()
                );
              });
            class c {
              constructor(e) {
                if (
                  ((this._lastColorId = 0),
                  (this._id2color = []),
                  (this._color2id = Object.create(null)),
                  Array.isArray(e))
                ) {
                  this._isFrozen = !0;
                  for (let t = 0, n = e.length; t < n; t++)
                    (this._color2id[e[t]] = t), (this._id2color[t] = e[t]);
                } else this._isFrozen = !1;
              }
              getId(e) {
                if (null === e) return 0;
                e = e.toUpperCase();
                let t = this._color2id[e];
                if (t) return t;
                if (this._isFrozen)
                  throw Error(`Missing color in color map - ${e}`);
                return (
                  (t = ++this._lastColorId),
                  (this._color2id[e] = t),
                  (this._id2color[t] = e),
                  t
                );
              }
              getColorMap() {
                return this._id2color.slice(0);
              }
            }
            t.ColorMap = c;
            class u {
              constructor(e, t, n, r, s) {
                (this.scopeDepth = e),
                  (this.parentScopes = t),
                  (this.fontStyle = n),
                  (this.foreground = r),
                  (this.background = s);
              }
              clone() {
                return new u(
                  this.scopeDepth,
                  this.parentScopes,
                  this.fontStyle,
                  this.foreground,
                  this.background
                );
              }
              static cloneArr(e) {
                let t = [];
                for (let n = 0, r = e.length; n < r; n++) t[n] = e[n].clone();
                return t;
              }
              acceptOverwrite(e, t, n, r) {
                this.scopeDepth > e
                  ? console.log('how did this happen?')
                  : (this.scopeDepth = e),
                  -1 !== t && (this.fontStyle = t),
                  0 !== n && (this.foreground = n),
                  0 !== r && (this.background = r);
              }
            }
            t.ThemeTrieElementRule = u;
            class h {
              constructor(e, t = [], n = {}) {
                (this._mainRule = e),
                  (this._children = n),
                  (this._rulesWithParentScopes = t);
              }
              static _sortBySpecificity(e) {
                return 1 === e.length || e.sort(this._cmpBySpecificity), e;
              }
              static _cmpBySpecificity(e, t) {
                if (e.scopeDepth === t.scopeDepth) {
                  let n = e.parentScopes,
                    r = t.parentScopes,
                    s = null === n ? 0 : n.length,
                    a = null === r ? 0 : r.length;
                  if (s === a)
                    for (let e = 0; e < s; e++) {
                      let t = n[e].length,
                        s = r[e].length;
                      if (t !== s) return s - t;
                    }
                  return a - s;
                }
                return t.scopeDepth - e.scopeDepth;
              }
              match(e) {
                if ('' === e)
                  return h._sortBySpecificity(
                    []
                      .concat(this._mainRule)
                      .concat(this._rulesWithParentScopes)
                  );
                let t,
                  n,
                  r = e.indexOf('.');
                return (
                  -1 === r
                    ? ((t = e), (n = ''))
                    : ((t = e.substring(0, r)), (n = e.substring(r + 1))),
                  this._children.hasOwnProperty(t)
                    ? this._children[t].match(n)
                    : h._sortBySpecificity(
                        []
                          .concat(this._mainRule)
                          .concat(this._rulesWithParentScopes)
                      )
                );
              }
              insert(e, t, n, r, s, a) {
                if ('' === t) return void this._doInsertHere(e, n, r, s, a);
                let i,
                  o,
                  l,
                  c = t.indexOf('.');
                -1 === c
                  ? ((i = t), (o = ''))
                  : ((i = t.substring(0, c)), (o = t.substring(c + 1))),
                  this._children.hasOwnProperty(i)
                    ? (l = this._children[i])
                    : ((l = new h(
                        this._mainRule.clone(),
                        u.cloneArr(this._rulesWithParentScopes)
                      )),
                      (this._children[i] = l)),
                  l.insert(e + 1, o, n, r, s, a);
              }
              _doInsertHere(e, t, n, s, a) {
                if (null !== t) {
                  for (
                    let i = 0, o = this._rulesWithParentScopes.length;
                    i < o;
                    i++
                  ) {
                    let o = this._rulesWithParentScopes[i];
                    if (0 === r.strArrCmp(o.parentScopes, t))
                      return void o.acceptOverwrite(e, n, s, a);
                  }
                  -1 === n && (n = this._mainRule.fontStyle),
                    0 === s && (s = this._mainRule.foreground),
                    0 === a && (a = this._mainRule.background),
                    this._rulesWithParentScopes.push(new u(e, t, n, s, a));
                } else this._mainRule.acceptOverwrite(e, n, s, a);
              }
            }
            t.ThemeTrieElement = h;
          },
          878: (e, t) => {
            Object.defineProperty(t, '__esModule', { value: !0 }),
              (t.performanceNow =
                t.CachedFn =
                t.escapeRegExpCharacters =
                t.isValidHexColor =
                t.strArrCmp =
                t.strcmp =
                t.RegexSource =
                t.basename =
                t.mergeObjects =
                t.clone =
                  void 0),
              (t.clone = function (e) {
                return (function e(t) {
                  return Array.isArray(t)
                    ? (function (t) {
                        let n = [];
                        for (let r = 0, s = t.length; r < s; r++)
                          n[r] = e(t[r]);
                        return n;
                      })(t)
                    : 'object' == typeof t
                    ? (function (t) {
                        let n = {};
                        for (let r in t) n[r] = e(t[r]);
                        return n;
                      })(t)
                    : t;
                })(e);
              }),
              (t.mergeObjects = function (e, ...t) {
                return (
                  t.forEach(t => {
                    for (let n in t) e[n] = t[n];
                  }),
                  e
                );
              }),
              (t.basename = function e(t) {
                let n = ~t.lastIndexOf('/') || ~t.lastIndexOf('\\');
                return 0 === n
                  ? t
                  : ~n == t.length - 1
                  ? e(t.substring(0, t.length - 1))
                  : t.substr(1 + ~n);
              });
            let n = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/g;
            function r(e, t) {
              return e < t ? -1 : e > t ? 1 : 0;
            }
            (t.RegexSource = class {
              static hasCaptures(e) {
                return null !== e && ((n.lastIndex = 0), n.test(e));
              }
              static replaceCaptures(e, t, r) {
                return e.replace(n, (e, n, s, a) => {
                  let i = r[parseInt(n || s, 10)];
                  if (!i) return e;
                  {
                    let e = t.substring(i.start, i.end);
                    for (; '.' === e[0]; ) e = e.substring(1);
                    switch (a) {
                      case 'downcase':
                        return e.toLowerCase();
                      case 'upcase':
                        return e.toUpperCase();
                      default:
                        return e;
                    }
                  }
                });
              }
            }),
              (t.strcmp = r),
              (t.strArrCmp = function (e, t) {
                if (null === e && null === t) return 0;
                if (!e) return -1;
                if (!t) return 1;
                let n = e.length,
                  s = t.length;
                if (n === s) {
                  for (let s = 0; s < n; s++) {
                    let n = r(e[s], t[s]);
                    if (0 !== n) return n;
                  }
                  return 0;
                }
                return n - s;
              }),
              (t.isValidHexColor = function (e) {
                return !!(
                  /^#[0-9a-f]{6}$/i.test(e) ||
                  /^#[0-9a-f]{8}$/i.test(e) ||
                  /^#[0-9a-f]{3}$/i.test(e) ||
                  /^#[0-9a-f]{4}$/i.test(e)
                );
              }),
              (t.escapeRegExpCharacters = function (e) {
                return e.replace(
                  /[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g,
                  '\\$&'
                );
              }),
              (t.CachedFn = class {
                constructor(e) {
                  (this.fn = e), (this.cache = new Map());
                }
                get(e) {
                  if (this.cache.has(e)) return this.cache.get(e);
                  let t = this.fn(e);
                  return this.cache.set(e, t), t;
                }
              }),
              (t.performanceNow =
                'undefined' == typeof performance
                  ? function () {
                      return Date.now();
                    }
                  : function () {
                      return performance.now();
                    });
          },
        }),
        (s = {}),
        (function e(t) {
          var n = s[t];
          if (void 0 !== n) return n.exports;
          var a = (s[t] = { exports: {} });
          return r[t].call(a.exports, a, a.exports, e), a.exports;
        })(787));
    },
    78660: function (e, t, n) {
      'use strict';
      n.d(t, {
        x: function () {
          return r;
        },
      });
      class r {
        constructor(e, t) {
          (this.mimeType = e), (this.data = t);
        }
        hasData() {
          return null !== this.data && void 0 !== this.data;
        }
      }
    },
    13210: function (e, t, n) {
      'use strict';
      n.d(t, {
        L_: function () {
          return s;
        },
        O: function () {
          return u;
        },
        Oj: function () {
          return c;
        },
        Q2: function () {
          return l;
        },
        fQ: function () {
          return h;
        },
        g8: function () {
          return p;
        },
        j$: function () {
          return o;
        },
        wK: function () {
          return i;
        },
      });
      var r,
        s,
        a = n(78660);
      function i(e, t) {
        let n = new DOMParser().parseFromString(t, 'text/html'),
          r = n.querySelector(`blocksuite[data-type="${e}"]`);
        return r?.getAttribute('data-clipboard');
      }
      function o(e) {
        let t = e.clipboardData;
        if (!t) return;
        let n = t.getData(s.BLOCKSUITE_SURFACE);
        if (n) return JSON.parse(n);
        let r = t.getData(s.HTML),
          a = i(s.BLOCKSUITE_SURFACE, r);
        if (a) return JSON.parse(a);
      }
      function l(e) {
        let t = e.types;
        return (
          (1 === t.length && 'Files' === t[0]) ||
          (2 === t.length &&
            (t.includes('text/plain') || t.includes('text/html')) &&
            t.includes('Files'))
        );
      }
      function c(e) {
        let t = e.files;
        if (t && t[0] && t[0].type.indexOf('image') > -1) return t[0];
      }
      function u(e) {
        let t = !1,
          n = document.createElement('textarea');
        (n.value = 'temp'),
          document.body.appendChild(n),
          n.select(),
          n.setSelectionRange(0, n.value.length);
        let r = t => {
          let s = t.clipboardData;
          s && e.forEach(e => s.setData(e.mimeType, e.data)),
            t.preventDefault(),
            t.stopPropagation(),
            n.removeEventListener('copy', r);
        };
        n.addEventListener('copy', r);
        try {
          t = document.execCommand('copy');
        } finally {
          n.removeEventListener('copy', r), document.body.removeChild(n);
        }
        return t;
      }
      function h(e) {
        let t = JSON.stringify(e),
          n = new a.x(s.BLOCKSUITE_SURFACE, t),
          r = new a.x(s.HTML, p(t, s.BLOCKSUITE_SURFACE));
        return [n, r];
      }
      function p(e, t) {
        return `<blocksuite style="display: none" data-type="${t}" data-clipboard="${e.replace(
          /"/g,
          '&quot;'
        )}"></blocksuite>`;
      }
      ((r = s || (s = {})).HTML = 'text/html'),
        (r.TEXT = 'text/plain'),
        (r.BLOCKSUITE_PAGE = 'blocksuite/page'),
        (r.BLOCKSUITE_SURFACE = 'blocksuite/surface');
    },
    34057: function (e, t, n) {
      'use strict';
      n.d(t, {
        F: function () {
          return tm;
        },
      });
      var r,
        s,
        a = n(31054),
        i = n(13246);
      let o = (() => {
        let e = 0,
          t = () =>
            `0000${((1679616 * Math.random()) << 0).toString(36)}`.slice(-4);
        return () => `u${t()}${(e += 1)}`;
      })();
      function l(e) {
        let t = [];
        for (let n = 0, r = e.length; n < r; n++) t.push(e[n]);
        return t;
      }
      function c(e, t) {
        let n = e.ownerDocument.defaultView || window,
          r = n.getComputedStyle(e).getPropertyValue(t);
        return r ? parseFloat(r.replace('px', '')) : 0;
      }
      function u(e, t = {}) {
        let n =
            t.width ||
            (function (e) {
              let t = c(e, 'border-left-width'),
                n = c(e, 'border-right-width');
              return e.clientWidth + t + n;
            })(e),
          r =
            t.height ||
            (function (e) {
              let t = c(e, 'border-top-width'),
                n = c(e, 'border-bottom-width');
              return e.clientHeight + t + n;
            })(e);
        return { width: n, height: r };
      }
      function h(e) {
        return new Promise((t, n) => {
          let r = new Image();
          (r.decode = () => t(r)),
            (r.onload = () => t(r)),
            (r.onerror = n),
            (r.crossOrigin = 'anonymous'),
            (r.decoding = 'async'),
            (r.src = e);
        });
      }
      async function p(e) {
        return Promise.resolve()
          .then(() => new XMLSerializer().serializeToString(e))
          .then(encodeURIComponent)
          .then(e => `data:image/svg+xml;charset=utf-8,${e}`);
      }
      async function d(e, t, n) {
        let r = 'http://www.w3.org/2000/svg',
          s = document.createElementNS(r, 'svg'),
          a = document.createElementNS(r, 'foreignObject');
        return (
          s.setAttribute('width', `${t}`),
          s.setAttribute('height', `${n}`),
          s.setAttribute('viewBox', `0 0 ${t} ${n}`),
          a.setAttribute('width', '100%'),
          a.setAttribute('height', '100%'),
          a.setAttribute('x', '0'),
          a.setAttribute('y', '0'),
          a.setAttribute('externalResourcesRequired', 'true'),
          s.appendChild(a),
          a.appendChild(e),
          p(s)
        );
      }
      let f = (e, t) => {
        if (e instanceof t) return !0;
        let n = Object.getPrototypeOf(e);
        return null !== n && (n.constructor.name === t.name || f(n, t));
      };
      function g(e, t, n) {
        let r = window.getComputedStyle(e, n),
          s = r.getPropertyValue('content');
        if ('' === s || 'none' === s) return;
        let a = o();
        try {
          t.className = `${t.className} ${a}`;
        } catch (e) {
          return;
        }
        let i = document.createElement('style');
        i.appendChild(
          (function (e, t, n) {
            let r = `.${e}:${t}`,
              s = n.cssText
                ? (function (e) {
                    let t = e.getPropertyValue('content');
                    return `${e.cssText} content: '${t.replace(/'|"/g, '')}';`;
                  })(n)
                : l(n)
                    .map(e => {
                      let t = n.getPropertyValue(e),
                        r = n.getPropertyPriority(e);
                      return `${e}: ${t}${r ? ' !important' : ''};`;
                    })
                    .join(' ');
            return document.createTextNode(`${r}{${s}}`);
          })(a, n, r)
        ),
          t.appendChild(i);
      }
      let m = 'application/font-woff',
        b = 'image/jpeg',
        k = {
          woff: m,
          woff2: m,
          ttf: 'application/font-truetype',
          eot: 'application/vnd.ms-fontobject',
          png: 'image/png',
          jpg: b,
          jpeg: b,
          gif: 'image/gif',
          tiff: 'image/tiff',
          svg: 'image/svg+xml',
          webp: 'image/webp',
        };
      function y(e) {
        let t = (function (e) {
          let t = /\.([^./]*?)$/g.exec(e);
          return t ? t[1] : '';
        })(e).toLowerCase();
        return k[t] || '';
      }
      function _(e) {
        return -1 !== e.search(/^(data:)/);
      }
      function x(e, t) {
        return `data:${t};base64,${e}`;
      }
      async function w(e, t, n) {
        let r = await fetch(e, t);
        if (404 === r.status) throw Error(`Resource "${r.url}" not found`);
        let s = await r.blob();
        return new Promise((e, t) => {
          let a = new FileReader();
          (a.onerror = t),
            (a.onloadend = () => {
              try {
                e(n({ res: r, result: a.result }));
              } catch (e) {
                t(e);
              }
            }),
            a.readAsDataURL(s);
        });
      }
      let S = {};
      async function v(e, t, n) {
        var r, s, a;
        let i, o;
        let l =
          ((r = e),
          (s = t),
          (a = n.includeQueryParams),
          (o = r.replace(/\?.*/, '')),
          a && (o = r),
          /ttf|otf|eot|woff2?/i.test(o) && (o = o.replace(/.*\//, '')),
          s ? `[${s}]${o}` : o);
        if (null != S[l]) return S[l];
        n.cacheBust && (e += (/\?/.test(e) ? '&' : '?') + new Date().getTime());
        try {
          let r = await w(
            e,
            n.fetchRequestInit,
            ({ res: e, result: n }) => (
              t || (t = e.headers.get('Content-Type') || ''), n.split(/,/)[1]
            )
          );
          i = x(r, t);
        } catch (r) {
          i = n.imagePlaceholder || '';
          let t = `Failed to fetch resource: ${e}`;
          r && (t = 'string' == typeof r ? r : r.message), t && console.warn(t);
        }
        return (S[l] = i), i;
      }
      async function C(e) {
        let t = e.toDataURL();
        return 'data:,' === t ? e.cloneNode(!1) : h(t);
      }
      async function L(e, t) {
        if (e.currentSrc) {
          let t = document.createElement('canvas'),
            n = t.getContext('2d');
          (t.width = e.clientWidth),
            (t.height = e.clientHeight),
            null == n || n.drawImage(e, 0, 0, t.width, t.height);
          let r = t.toDataURL();
          return h(r);
        }
        let n = e.poster,
          r = y(n),
          s = await v(n, r, t);
        return h(s);
      }
      async function P(e) {
        var t;
        try {
          if (
            null === (t = null == e ? void 0 : e.contentDocument) ||
            void 0 === t
              ? void 0
              : t.body
          )
            return await E(e.contentDocument.body, {}, !0);
        } catch (e) {}
        return e.cloneNode(!1);
      }
      async function T(e, t) {
        return f(e, HTMLCanvasElement)
          ? C(e)
          : f(e, HTMLVideoElement)
          ? L(e, t)
          : f(e, HTMLIFrameElement)
          ? P(e)
          : e.cloneNode(!1);
      }
      let N = e => null != e.tagName && 'SLOT' === e.tagName.toUpperCase();
      async function A(e, t, n) {
        var r, s;
        let a = [];
        return (
          0 ===
            (a =
              N(e) && e.assignedNodes
                ? l(e.assignedNodes())
                : f(e, HTMLIFrameElement) &&
                  (null === (r = e.contentDocument) || void 0 === r
                    ? void 0
                    : r.body)
                ? l(e.contentDocument.body.childNodes)
                : l(
                    (null !== (s = e.shadowRoot) && void 0 !== s ? s : e)
                      .childNodes
                  )).length ||
            f(e, HTMLVideoElement) ||
            (await a.reduce(
              (e, r) =>
                e
                  .then(() => E(r, n))
                  .then(e => {
                    e && t.appendChild(e);
                  }),
              Promise.resolve()
            )),
          t
        );
      }
      async function R(e, t) {
        let n = e.querySelectorAll ? e.querySelectorAll('use') : [];
        if (0 === n.length) return e;
        let r = {};
        for (let s = 0; s < n.length; s++) {
          let a = n[s],
            i = a.getAttribute('xlink:href');
          if (i) {
            let n = e.querySelector(i),
              s = document.querySelector(i);
            n || !s || r[i] || (r[i] = await E(s, t, !0));
          }
        }
        let s = Object.values(r);
        if (s.length) {
          let t = 'http://www.w3.org/1999/xhtml',
            n = document.createElementNS(t, 'svg');
          n.setAttribute('xmlns', t),
            (n.style.position = 'absolute'),
            (n.style.width = '0'),
            (n.style.height = '0'),
            (n.style.overflow = 'hidden'),
            (n.style.display = 'none');
          let r = document.createElementNS(t, 'defs');
          n.appendChild(r);
          for (let e = 0; e < s.length; e++) r.appendChild(s[e]);
          e.appendChild(n);
        }
        return e;
      }
      async function E(e, t, n) {
        return n || !t.filter || t.filter(e)
          ? Promise.resolve(e)
              .then(e => T(e, t))
              .then(n => A(e, n, t))
              .then(t =>
                (function (e, t) {
                  if (f(t, Element)) {
                    var n;
                    !(function (e, t) {
                      let n = t.style;
                      if (!n) return;
                      let r = window.getComputedStyle(e);
                      r.cssText
                        ? ((n.cssText = r.cssText),
                          (n.transformOrigin = r.transformOrigin))
                        : l(r).forEach(s => {
                            let a = r.getPropertyValue(s);
                            if ('font-size' === s && a.endsWith('px')) {
                              let e =
                                Math.floor(
                                  parseFloat(a.substring(0, a.length - 2))
                                ) - 0.1;
                              a = `${e}px`;
                            }
                            f(e, HTMLIFrameElement) &&
                              'display' === s &&
                              'inline' === a &&
                              (a = 'block'),
                              'd' === s &&
                                t.getAttribute('d') &&
                                (a = `path(${t.getAttribute('d')})`),
                              n.setProperty(s, a, r.getPropertyPriority(s));
                          });
                    })(e, t),
                      g(e, t, ':before'),
                      g(e, t, ':after'),
                      (n = t),
                      f(e, HTMLTextAreaElement) && (n.innerHTML = e.value),
                      f(e, HTMLInputElement) &&
                        n.setAttribute('value', e.value),
                      (function (e, t) {
                        if (f(e, HTMLSelectElement)) {
                          let n = Array.from(t.children).find(
                            t => e.value === t.getAttribute('value')
                          );
                          n && n.setAttribute('selected', '');
                        }
                      })(e, t);
                  }
                  return t;
                })(e, t)
              )
              .then(e => R(e, t))
          : null;
      }
      let j = /url\((['"]?)([^'"]+?)\1\)/g,
        I = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,
        $ = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
      async function O(e, t, n, r, s) {
        try {
          let a;
          let i = n
              ? (function (e, t) {
                  if (e.match(/^[a-z]+:\/\//i)) return e;
                  if (e.match(/^\/\//)) return window.location.protocol + e;
                  if (e.match(/^[a-z]+:/i)) return e;
                  let n = document.implementation.createHTMLDocument(),
                    r = n.createElement('base'),
                    s = n.createElement('a');
                  return (
                    n.head.appendChild(r),
                    n.body.appendChild(s),
                    t && (r.href = t),
                    (s.href = e),
                    s.href
                  );
                })(t, n)
              : t,
            o = y(t);
          if (s) {
            let e = await s(i);
            a = x(e, o);
          } else a = await v(i, o, r);
          return e.replace(
            (function (e) {
              let t = e.replace(/([.*+?^${}()|\[\]\/\\])/g, '\\$1');
              return RegExp(`(url\\(['"]?)(${t})(['"]?\\))`, 'g');
            })(t),
            `$1${a}$3`
          );
        } catch (e) {}
        return e;
      }
      function B(e) {
        return -1 !== e.search(j);
      }
      async function M(e, t, n) {
        if (!B(e)) return e;
        let r = (function (e, { preferredFontFormat: t }) {
            return t
              ? e.replace($, e => {
                  for (;;) {
                    let [n, , r] = I.exec(e) || [];
                    if (!r) return '';
                    if (r === t) return `src: ${n};`;
                  }
                })
              : e;
          })(e, n),
          s = (function (e) {
            let t = [];
            return (
              e.replace(j, (e, n, r) => (t.push(r), e)), t.filter(e => !_(e))
            );
          })(r);
        return s.reduce(
          (e, r) => e.then(e => O(e, r, t, n)),
          Promise.resolve(r)
        );
      }
      async function D(e, t, n) {
        var r;
        let s =
          null === (r = t.style) || void 0 === r
            ? void 0
            : r.getPropertyValue(e);
        if (s) {
          let r = await M(s, null, n);
          return t.style.setProperty(e, r, t.style.getPropertyPriority(e)), !0;
        }
        return !1;
      }
      async function F(e, t) {
        (await D('background', e, t)) || (await D('background-image', e, t)),
          (await D('mask', e, t)) || (await D('mask-image', e, t));
      }
      async function G(e, t) {
        let n = f(e, HTMLImageElement);
        if (!(n && !_(e.src)) && !(f(e, SVGImageElement) && !_(e.href.baseVal)))
          return;
        let r = n ? e.src : e.href.baseVal,
          s = await v(r, y(r), t);
        await new Promise((t, r) => {
          (e.onload = t), (e.onerror = r);
          let a = e;
          a.decode && (a.decode = t),
            'lazy' === a.loading && (a.loading = 'eager'),
            n ? ((e.srcset = ''), (e.src = s)) : (e.href.baseVal = s);
        });
      }
      async function H(e, t) {
        let n = l(e.childNodes),
          r = n.map(e => U(e, t));
        await Promise.all(r).then(() => e);
      }
      async function U(e, t) {
        f(e, Element) && (await F(e, t), await G(e, t), await H(e, t));
      }
      let z = {};
      async function q(e) {
        let t = z[e];
        if (null != t) return t;
        let n = await fetch(e),
          r = await n.text();
        return (t = { url: e, cssText: r }), (z[e] = t), t;
      }
      async function W(e, t) {
        let n = e.cssText,
          r = /url\(["']?([^"')]+)["']?\)/g,
          s = n.match(/url\([^)]+\)/g) || [],
          a = s.map(async s => {
            let a = s.replace(r, '$1');
            return (
              a.startsWith('https://') || (a = new URL(a, e.url).href),
              w(
                a,
                t.fetchRequestInit,
                ({ result: e }) => ((n = n.replace(s, `url(${e})`)), [s, e])
              )
            );
          });
        return Promise.all(a).then(() => n);
      }
      function V(e) {
        if (null == e) return [];
        let t = [],
          n = e.replace(/(\/\*[\s\S]*?\*\/)/gi, ''),
          r = RegExp('((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})', 'gi');
        for (;;) {
          let e = r.exec(n);
          if (null === e) break;
          t.push(e[0]);
        }
        n = n.replace(r, '');
        let s = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,
          a = RegExp(
            '((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})',
            'gi'
          );
        for (;;) {
          let e = s.exec(n);
          if (null === e) {
            if (null === (e = a.exec(n))) break;
            s.lastIndex = a.lastIndex;
          } else a.lastIndex = s.lastIndex;
          t.push(e[0]);
        }
        return t;
      }
      async function Q(e, t) {
        let n = [],
          r = [];
        return (
          e.forEach(n => {
            if ('cssRules' in n)
              try {
                l(n.cssRules || []).forEach((e, s) => {
                  if (e.type === CSSRule.IMPORT_RULE) {
                    let a = s + 1,
                      i = e.href,
                      o = q(i)
                        .then(e => W(e, t))
                        .then(e =>
                          V(e).forEach(e => {
                            try {
                              n.insertRule(
                                e,
                                e.startsWith('@import')
                                  ? (a += 1)
                                  : n.cssRules.length
                              );
                            } catch (t) {
                              console.error(
                                'Error inserting rule from remote css',
                                { rule: e, error: t }
                              );
                            }
                          })
                        )
                        .catch(e => {
                          console.error(
                            'Error loading remote css',
                            e.toString()
                          );
                        });
                    r.push(o);
                  }
                });
              } catch (a) {
                let s = e.find(e => null == e.href) || document.styleSheets[0];
                null != n.href &&
                  r.push(
                    q(n.href)
                      .then(e => W(e, t))
                      .then(e =>
                        V(e).forEach(e => {
                          s.insertRule(e, n.cssRules.length);
                        })
                      )
                      .catch(e => {
                        console.error('Error loading remote stylesheet', e);
                      })
                  ),
                  console.error('Error inlining remote css file', a);
              }
          }),
          Promise.all(r).then(
            () => (
              e.forEach(e => {
                if ('cssRules' in e)
                  try {
                    l(e.cssRules || []).forEach(e => {
                      n.push(e);
                    });
                  } catch (t) {
                    console.error(
                      `Error while reading CSS rules from ${e.href}`,
                      t
                    );
                  }
              }),
              n
            )
          )
        );
      }
      async function K(e, t) {
        if (null == e.ownerDocument)
          throw Error('Provided element is not within a Document');
        let n = l(e.ownerDocument.styleSheets),
          r = await Q(n, t);
        return r
          .filter(e => e.type === CSSRule.FONT_FACE_RULE)
          .filter(e => B(e.style.getPropertyValue('src')));
      }
      async function Z(e, t) {
        let n = await K(e, t),
          r = await Promise.all(
            n.map(e => {
              let n = e.parentStyleSheet ? e.parentStyleSheet.href : null;
              return M(e.cssText, n, t);
            })
          );
        return r.join('\n');
      }
      async function Y(e, t) {
        let n =
          null != t.fontEmbedCSS
            ? t.fontEmbedCSS
            : t.skipFonts
            ? null
            : await Z(e, t);
        if (n) {
          let t = document.createElement('style'),
            r = document.createTextNode(n);
          t.appendChild(r),
            e.firstChild ? e.insertBefore(t, e.firstChild) : e.appendChild(t);
        }
      }
      async function X(e, t = {}) {
        let { width: n, height: r } = u(e, t),
          s = await E(e, t, !0);
        await Y(s, t),
          await U(s, t),
          (function (e, t) {
            let { style: n } = e;
            t.backgroundColor && (n.backgroundColor = t.backgroundColor),
              t.width && (n.width = `${t.width}px`),
              t.height && (n.height = `${t.height}px`);
            let r = t.style;
            null != r &&
              Object.keys(r).forEach(e => {
                n[e] = r[e];
              });
          })(s, t);
        let a = await d(s, n, r);
        return a;
      }
      async function J(e, t = {}) {
        let { width: n, height: r } = u(e, t),
          s = await X(e, t),
          a = await h(s),
          i = document.createElement('canvas'),
          o = i.getContext('2d'),
          l =
            t.pixelRatio ||
            (function () {
              let e, t;
              try {
                t = process;
              } catch (e) {}
              let n = t && t.env ? t.env.devicePixelRatio : null;
              return (
                n && Number.isNaN((e = parseInt(n, 10))) && (e = 1),
                e || window.devicePixelRatio || 1
              );
            })(),
          c = t.canvasWidth || n,
          p = t.canvasHeight || r;
        if (((i.width = c * l), (i.height = p * l), !t.skipAutoScale)) {
          var d;
          ((d = i).width > 16384 || d.height > 16384) &&
            (d.width > 16384 && d.height > 16384
              ? d.width > d.height
                ? ((d.height *= 16384 / d.width), (d.width = 16384))
                : ((d.width *= 16384 / d.height), (d.height = 16384))
              : d.width > 16384
              ? ((d.height *= 16384 / d.width), (d.width = 16384))
              : ((d.width *= 16384 / d.height), (d.height = 16384)));
        }
        return (
          (i.style.width = `${c}`),
          (i.style.height = `${p}`),
          t.backgroundColor &&
            ((o.fillStyle = t.backgroundColor),
            o.fillRect(0, 0, i.width, i.height)),
          o.drawImage(a, 0, 0, i.width, i.height),
          i
        );
      }
      async function ee(e, t = {}) {
        let n = await J(e, t);
        return n.toDataURL();
      }
      function et() {
        return {
          async: !1,
          baseUrl: null,
          breaks: !1,
          extensions: null,
          gfm: !0,
          headerIds: !0,
          headerPrefix: '',
          highlight: null,
          hooks: null,
          langPrefix: 'language-',
          mangle: !0,
          pedantic: !1,
          renderer: null,
          sanitize: !1,
          sanitizer: null,
          silent: !1,
          smartypants: !1,
          tokenizer: null,
          walkTokens: null,
          xhtml: !1,
        };
      }
      let en = et(),
        er = /[&<>"']/,
        es = RegExp(er.source, 'g'),
        ea = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
        ei = RegExp(ea.source, 'g'),
        eo = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        },
        el = e => eo[e];
      function ec(e, t) {
        if (t) {
          if (er.test(e)) return e.replace(es, el);
        } else if (ea.test(e)) return e.replace(ei, el);
        return e;
      }
      let eu = /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi;
      function eh(e) {
        return e.replace(eu, (e, t) =>
          'colon' === (t = t.toLowerCase())
            ? ':'
            : '#' === t.charAt(0)
            ? 'x' === t.charAt(1)
              ? String.fromCharCode(parseInt(t.substring(2), 16))
              : String.fromCharCode(+t.substring(1))
            : ''
        );
      }
      let ep = /(^|[^\[])\^/g;
      function ed(e, t) {
        (e = 'string' == typeof e ? e : e.source), (t = t || '');
        let n = {
          replace: (t, r) => (
            (r = (r = r.source || r).replace(ep, '$1')),
            (e = e.replace(t, r)),
            n
          ),
          getRegex: () => new RegExp(e, t),
        };
        return n;
      }
      let ef = /[^\w:]/g,
        eg = /^$|^[a-z][a-z0-9+.-]*:|^[?#]/i;
      function em(e, t, n) {
        if (e) {
          let e;
          try {
            e = decodeURIComponent(eh(n)).replace(ef, '').toLowerCase();
          } catch (e) {
            return null;
          }
          if (
            0 === e.indexOf('javascript:') ||
            0 === e.indexOf('vbscript:') ||
            0 === e.indexOf('data:')
          )
            return null;
        }
        t &&
          !eg.test(n) &&
          (n = (function (e, t) {
            eb[' ' + e] ||
              (ek.test(e)
                ? (eb[' ' + e] = e + '/')
                : (eb[' ' + e] = eS(e, '/', !0))),
              (e = eb[' ' + e]);
            let n = -1 === e.indexOf(':');
            return '//' === t.substring(0, 2)
              ? n
                ? t
                : e.replace(ey, '$1') + t
              : '/' !== t.charAt(0)
              ? e + t
              : n
              ? t
              : e.replace(e_, '$1') + t;
          })(t, n));
        try {
          n = encodeURI(n).replace(/%25/g, '%');
        } catch (e) {
          return null;
        }
        return n;
      }
      let eb = {},
        ek = /^[^:]+:\/*[^/]*$/,
        ey = /^([^:]+:)[\s\S]*$/,
        e_ = /^([^:]+:\/*[^/]*)[\s\S]*$/,
        ex = { exec: function () {} };
      function ew(e, t) {
        let n = e.replace(/\|/g, (e, t, n) => {
            let r = !1,
              s = t;
            for (; --s >= 0 && '\\' === n[s]; ) r = !r;
            return r ? '|' : ' |';
          }),
          r = n.split(/ \|/),
          s = 0;
        if (
          (r[0].trim() || r.shift(),
          r.length > 0 && !r[r.length - 1].trim() && r.pop(),
          r.length > t)
        )
          r.splice(t);
        else for (; r.length < t; ) r.push('');
        for (; s < r.length; s++) r[s] = r[s].trim().replace(/\\\|/g, '|');
        return r;
      }
      function eS(e, t, n) {
        let r = e.length;
        if (0 === r) return '';
        let s = 0;
        for (; s < r; ) {
          let a = e.charAt(r - s - 1);
          if (a !== t || n) {
            if (a !== t && n) s++;
            else break;
          } else s++;
        }
        return e.slice(0, r - s);
      }
      function ev(e, t) {
        if (t < 1) return '';
        let n = '';
        for (; t > 1; ) 1 & t && (n += e), (t >>= 1), (e += e);
        return n + e;
      }
      function eC(e, t, n, r) {
        let s = t.href,
          a = t.title ? ec(t.title) : null,
          i = e[1].replace(/\\([\[\]])/g, '$1');
        if ('!' !== e[0].charAt(0)) {
          r.state.inLink = !0;
          let e = {
            type: 'link',
            raw: n,
            href: s,
            title: a,
            text: i,
            tokens: r.inlineTokens(i),
          };
          return (r.state.inLink = !1), e;
        }
        return { type: 'image', raw: n, href: s, title: a, text: ec(i) };
      }
      class eL {
        constructor(e) {
          this.options = e || en;
        }
        space(e) {
          let t = this.rules.block.newline.exec(e);
          if (t && t[0].length > 0) return { type: 'space', raw: t[0] };
        }
        code(e) {
          let t = this.rules.block.code.exec(e);
          if (t) {
            let e = t[0].replace(/^ {1,4}/gm, '');
            return {
              type: 'code',
              raw: t[0],
              codeBlockStyle: 'indented',
              text: this.options.pedantic ? e : eS(e, '\n'),
            };
          }
        }
        fences(e) {
          let t = this.rules.block.fences.exec(e);
          if (t) {
            let e = t[0],
              n = (function (e, t) {
                let n = e.match(/^(\s+)(?:```)/);
                if (null === n) return t;
                let r = n[1];
                return t
                  .split('\n')
                  .map(e => {
                    let t = e.match(/^\s+/);
                    if (null === t) return e;
                    let [n] = t;
                    return n.length >= r.length ? e.slice(r.length) : e;
                  })
                  .join('\n');
              })(e, t[3] || '');
            return {
              type: 'code',
              raw: e,
              lang: t[2]
                ? t[2].trim().replace(this.rules.inline._escapes, '$1')
                : t[2],
              text: n,
            };
          }
        }
        heading(e) {
          let t = this.rules.block.heading.exec(e);
          if (t) {
            let e = t[2].trim();
            if (/#$/.test(e)) {
              let t = eS(e, '#');
              this.options.pedantic
                ? (e = t.trim())
                : (!t || / $/.test(t)) && (e = t.trim());
            }
            return {
              type: 'heading',
              raw: t[0],
              depth: t[1].length,
              text: e,
              tokens: this.lexer.inline(e),
            };
          }
        }
        hr(e) {
          let t = this.rules.block.hr.exec(e);
          if (t) return { type: 'hr', raw: t[0] };
        }
        blockquote(e) {
          let t = this.rules.block.blockquote.exec(e);
          if (t) {
            let e = t[0].replace(/^ *>[ \t]?/gm, ''),
              n = this.lexer.state.top;
            this.lexer.state.top = !0;
            let r = this.lexer.blockTokens(e);
            return (
              (this.lexer.state.top = n),
              { type: 'blockquote', raw: t[0], tokens: r, text: e }
            );
          }
        }
        list(e) {
          let t = this.rules.block.list.exec(e);
          if (t) {
            let n, r, s, a, i, o, l, c, u, h, p, d;
            let f = t[1].trim(),
              g = f.length > 1,
              m = {
                type: 'list',
                raw: '',
                ordered: g,
                start: g ? +f.slice(0, -1) : '',
                loose: !1,
                items: [],
              };
            (f = g ? `\\d{1,9}\\${f.slice(-1)}` : `\\${f}`),
              this.options.pedantic && (f = g ? f : '[*+-]');
            let b = RegExp(`^( {0,3}${f})((?:[	 ][^\\n]*)?(?:\\n|$))`);
            for (
              ;
              e &&
              ((d = !1), !(!(t = b.exec(e)) || this.rules.block.hr.test(e)));

            ) {
              if (
                ((n = t[0]),
                (e = e.substring(n.length)),
                (c = t[2]
                  .split('\n', 1)[0]
                  .replace(/^\t+/, e => ' '.repeat(3 * e.length))),
                (u = e.split('\n', 1)[0]),
                this.options.pedantic
                  ? ((a = 2), (p = c.trimLeft()))
                  : ((a = (a = t[2].search(/[^ ]/)) > 4 ? 1 : a),
                    (p = c.slice(a)),
                    (a += t[1].length)),
                (o = !1),
                !c &&
                  /^ *$/.test(u) &&
                  ((n += u + '\n'), (e = e.substring(u.length + 1)), (d = !0)),
                !d)
              ) {
                let t = RegExp(
                    `^ {0,${Math.min(
                      3,
                      a - 1
                    )}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`
                  ),
                  r = RegExp(
                    `^ {0,${Math.min(
                      3,
                      a - 1
                    )}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`
                  ),
                  s = RegExp(`^ {0,${Math.min(3, a - 1)}}(?:\`\`\`|~~~)`),
                  i = RegExp(`^ {0,${Math.min(3, a - 1)}}#`);
                for (
                  ;
                  e &&
                  ((u = h = e.split('\n', 1)[0]),
                  this.options.pedantic &&
                    (u = u.replace(/^ {1,4}(?=( {4})*[^ ])/g, '  ')),
                  !(s.test(u) || i.test(u) || t.test(u) || r.test(e)));

                ) {
                  if (u.search(/[^ ]/) >= a || !u.trim())
                    p += '\n' + u.slice(a);
                  else {
                    if (
                      o ||
                      c.search(/[^ ]/) >= 4 ||
                      s.test(c) ||
                      i.test(c) ||
                      r.test(c)
                    )
                      break;
                    p += '\n' + u;
                  }
                  o || u.trim() || (o = !0),
                    (n += h + '\n'),
                    (e = e.substring(h.length + 1)),
                    (c = u.slice(a));
                }
              }
              !m.loose &&
                (l ? (m.loose = !0) : /\n *\n *$/.test(n) && (l = !0)),
                this.options.gfm &&
                  (r = /^\[[ xX]\] /.exec(p)) &&
                  ((s = '[ ] ' !== r[0]), (p = p.replace(/^\[[ xX]\] +/, ''))),
                m.items.push({
                  type: 'list_item',
                  raw: n,
                  task: !!r,
                  checked: s,
                  loose: !1,
                  text: p,
                }),
                (m.raw += n);
            }
            (m.items[m.items.length - 1].raw = n.trimRight()),
              (m.items[m.items.length - 1].text = p.trimRight()),
              (m.raw = m.raw.trimRight());
            let k = m.items.length;
            for (i = 0; i < k; i++)
              if (
                ((this.lexer.state.top = !1),
                (m.items[i].tokens = this.lexer.blockTokens(
                  m.items[i].text,
                  []
                )),
                !m.loose)
              ) {
                let e = m.items[i].tokens.filter(e => 'space' === e.type),
                  t = e.length > 0 && e.some(e => /\n.*\n/.test(e.raw));
                m.loose = t;
              }
            if (m.loose) for (i = 0; i < k; i++) m.items[i].loose = !0;
            return m;
          }
        }
        html(e) {
          let t = this.rules.block.html.exec(e);
          if (t) {
            let e = {
              type: 'html',
              raw: t[0],
              pre:
                !this.options.sanitizer &&
                ('pre' === t[1] || 'script' === t[1] || 'style' === t[1]),
              text: t[0],
            };
            if (this.options.sanitize) {
              let n = this.options.sanitizer
                ? this.options.sanitizer(t[0])
                : ec(t[0]);
              (e.type = 'paragraph'),
                (e.text = n),
                (e.tokens = this.lexer.inline(n));
            }
            return e;
          }
        }
        def(e) {
          let t = this.rules.block.def.exec(e);
          if (t) {
            let e = t[1].toLowerCase().replace(/\s+/g, ' '),
              n = t[2]
                ? t[2]
                    .replace(/^<(.*)>$/, '$1')
                    .replace(this.rules.inline._escapes, '$1')
                : '',
              r = t[3]
                ? t[3]
                    .substring(1, t[3].length - 1)
                    .replace(this.rules.inline._escapes, '$1')
                : t[3];
            return { type: 'def', tag: e, raw: t[0], href: n, title: r };
          }
        }
        table(e) {
          let t = this.rules.block.table.exec(e);
          if (t) {
            let e = {
              type: 'table',
              header: ew(t[1]).map(e => ({ text: e })),
              align: t[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
              rows:
                t[3] && t[3].trim()
                  ? t[3].replace(/\n[ \t]*$/, '').split('\n')
                  : [],
            };
            if (e.header.length === e.align.length) {
              let n, r, s, a;
              e.raw = t[0];
              let i = e.align.length;
              for (n = 0; n < i; n++)
                /^ *-+: *$/.test(e.align[n])
                  ? (e.align[n] = 'right')
                  : /^ *:-+: *$/.test(e.align[n])
                  ? (e.align[n] = 'center')
                  : /^ *:-+ *$/.test(e.align[n])
                  ? (e.align[n] = 'left')
                  : (e.align[n] = null);
              for (n = 0, i = e.rows.length; n < i; n++)
                e.rows[n] = ew(e.rows[n], e.header.length).map(e => ({
                  text: e,
                }));
              for (r = 0, i = e.header.length; r < i; r++)
                e.header[r].tokens = this.lexer.inline(e.header[r].text);
              for (r = 0, i = e.rows.length; r < i; r++)
                for (s = 0, a = e.rows[r]; s < a.length; s++)
                  a[s].tokens = this.lexer.inline(a[s].text);
              return e;
            }
          }
        }
        lheading(e) {
          let t = this.rules.block.lheading.exec(e);
          if (t)
            return {
              type: 'heading',
              raw: t[0],
              depth: '=' === t[2].charAt(0) ? 1 : 2,
              text: t[1],
              tokens: this.lexer.inline(t[1]),
            };
        }
        paragraph(e) {
          let t = this.rules.block.paragraph.exec(e);
          if (t) {
            let e =
              '\n' === t[1].charAt(t[1].length - 1) ? t[1].slice(0, -1) : t[1];
            return {
              type: 'paragraph',
              raw: t[0],
              text: e,
              tokens: this.lexer.inline(e),
            };
          }
        }
        text(e) {
          let t = this.rules.block.text.exec(e);
          if (t)
            return {
              type: 'text',
              raw: t[0],
              text: t[0],
              tokens: this.lexer.inline(t[0]),
            };
        }
        escape(e) {
          let t = this.rules.inline.escape.exec(e);
          if (t) return { type: 'escape', raw: t[0], text: ec(t[1]) };
        }
        tag(e) {
          let t = this.rules.inline.tag.exec(e);
          if (t)
            return (
              !this.lexer.state.inLink && /^<a /i.test(t[0])
                ? (this.lexer.state.inLink = !0)
                : this.lexer.state.inLink &&
                  /^<\/a>/i.test(t[0]) &&
                  (this.lexer.state.inLink = !1),
              !this.lexer.state.inRawBlock &&
              /^<(pre|code|kbd|script)(\s|>)/i.test(t[0])
                ? (this.lexer.state.inRawBlock = !0)
                : this.lexer.state.inRawBlock &&
                  /^<\/(pre|code|kbd|script)(\s|>)/i.test(t[0]) &&
                  (this.lexer.state.inRawBlock = !1),
              {
                type: this.options.sanitize ? 'text' : 'html',
                raw: t[0],
                inLink: this.lexer.state.inLink,
                inRawBlock: this.lexer.state.inRawBlock,
                text: this.options.sanitize
                  ? this.options.sanitizer
                    ? this.options.sanitizer(t[0])
                    : ec(t[0])
                  : t[0],
              }
            );
        }
        link(e) {
          let t = this.rules.inline.link.exec(e);
          if (t) {
            let e = t[2].trim();
            if (!this.options.pedantic && /^</.test(e)) {
              if (!/>$/.test(e)) return;
              let t = eS(e.slice(0, -1), '\\');
              if ((e.length - t.length) % 2 == 0) return;
            } else {
              let e = (function (e, t) {
                if (-1 === e.indexOf(t[1])) return -1;
                let n = e.length,
                  r = 0,
                  s = 0;
                for (; s < n; s++)
                  if ('\\' === e[s]) s++;
                  else if (e[s] === t[0]) r++;
                  else if (e[s] === t[1] && --r < 0) return s;
                return -1;
              })(t[2], '()');
              if (e > -1) {
                let n = 0 === t[0].indexOf('!') ? 5 : 4,
                  r = n + t[1].length + e;
                (t[2] = t[2].substring(0, e)),
                  (t[0] = t[0].substring(0, r).trim()),
                  (t[3] = '');
              }
            }
            let n = t[2],
              r = '';
            if (this.options.pedantic) {
              let e = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(n);
              e && ((n = e[1]), (r = e[3]));
            } else r = t[3] ? t[3].slice(1, -1) : '';
            return (
              (n = n.trim()),
              /^</.test(n) &&
                (n =
                  this.options.pedantic && !/>$/.test(e)
                    ? n.slice(1)
                    : n.slice(1, -1)),
              eC(
                t,
                {
                  href: n ? n.replace(this.rules.inline._escapes, '$1') : n,
                  title: r ? r.replace(this.rules.inline._escapes, '$1') : r,
                },
                t[0],
                this.lexer
              )
            );
          }
        }
        reflink(e, t) {
          let n;
          if (
            (n = this.rules.inline.reflink.exec(e)) ||
            (n = this.rules.inline.nolink.exec(e))
          ) {
            let e = (n[2] || n[1]).replace(/\s+/g, ' ');
            if (!(e = t[e.toLowerCase()])) {
              let e = n[0].charAt(0);
              return { type: 'text', raw: e, text: e };
            }
            return eC(n, e, n[0], this.lexer);
          }
        }
        emStrong(e, t, n = '') {
          let r = this.rules.inline.emStrong.lDelim.exec(e);
          if (!r || (r[3] && n.match(/[\p{L}\p{N}]/u))) return;
          let s = r[1] || r[2] || '';
          if (
            !s ||
            (s && ('' === n || this.rules.inline.punctuation.exec(n)))
          ) {
            let n = r[0].length - 1,
              s,
              a,
              i = n,
              o = 0,
              l =
                '*' === r[0][0]
                  ? this.rules.inline.emStrong.rDelimAst
                  : this.rules.inline.emStrong.rDelimUnd;
            for (
              l.lastIndex = 0, t = t.slice(-1 * e.length + n);
              null != (r = l.exec(t));

            ) {
              if (!(s = r[1] || r[2] || r[3] || r[4] || r[5] || r[6])) continue;
              if (((a = s.length), r[3] || r[4])) {
                i += a;
                continue;
              }
              if ((r[5] || r[6]) && n % 3 && !((n + a) % 3)) {
                o += a;
                continue;
              }
              if ((i -= a) > 0) continue;
              a = Math.min(a, a + i + o);
              let t = e.slice(0, n + r.index + (r[0].length - s.length) + a);
              if (Math.min(n, a) % 2) {
                let e = t.slice(1, -1);
                return {
                  type: 'em',
                  raw: t,
                  text: e,
                  tokens: this.lexer.inlineTokens(e),
                };
              }
              let l = t.slice(2, -2);
              return {
                type: 'strong',
                raw: t,
                text: l,
                tokens: this.lexer.inlineTokens(l),
              };
            }
          }
        }
        codespan(e) {
          let t = this.rules.inline.code.exec(e);
          if (t) {
            let e = t[2].replace(/\n/g, ' '),
              n = /[^ ]/.test(e),
              r = /^ /.test(e) && / $/.test(e);
            return (
              n && r && (e = e.substring(1, e.length - 1)),
              (e = ec(e, !0)),
              { type: 'codespan', raw: t[0], text: e }
            );
          }
        }
        br(e) {
          let t = this.rules.inline.br.exec(e);
          if (t) return { type: 'br', raw: t[0] };
        }
        del(e) {
          let t = this.rules.inline.del.exec(e);
          if (t)
            return {
              type: 'del',
              raw: t[0],
              text: t[2],
              tokens: this.lexer.inlineTokens(t[2]),
            };
        }
        autolink(e, t) {
          let n = this.rules.inline.autolink.exec(e);
          if (n) {
            let e, r;
            return (
              (r =
                '@' === n[2]
                  ? 'mailto:' + (e = ec(this.options.mangle ? t(n[1]) : n[1]))
                  : (e = ec(n[1]))),
              {
                type: 'link',
                raw: n[0],
                text: e,
                href: r,
                tokens: [{ type: 'text', raw: e, text: e }],
              }
            );
          }
        }
        url(e, t) {
          let n;
          if ((n = this.rules.inline.url.exec(e))) {
            let e, r;
            if ('@' === n[2])
              r = 'mailto:' + (e = ec(this.options.mangle ? t(n[0]) : n[0]));
            else {
              let t;
              do
                (t = n[0]), (n[0] = this.rules.inline._backpedal.exec(n[0])[0]);
              while (t !== n[0]);
              (e = ec(n[0])), (r = 'www.' === n[1] ? 'http://' + n[0] : n[0]);
            }
            return {
              type: 'link',
              raw: n[0],
              text: e,
              href: r,
              tokens: [{ type: 'text', raw: e, text: e }],
            };
          }
        }
        inlineText(e, t) {
          let n = this.rules.inline.text.exec(e);
          if (n) {
            let e;
            return (
              (e = this.lexer.state.inRawBlock
                ? this.options.sanitize
                  ? this.options.sanitizer
                    ? this.options.sanitizer(n[0])
                    : ec(n[0])
                  : n[0]
                : ec(this.options.smartypants ? t(n[0]) : n[0])),
              { type: 'text', raw: n[0], text: e }
            );
          }
        }
      }
      let eP = {
        newline: /^(?: *(?:\n|$))+/,
        code: /^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,
        fences:
          /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,
        hr: /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,
        heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
        blockquote: /^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/,
        list: /^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/,
        html: '^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))',
        def: /^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/,
        table: ex,
        lheading: /^((?:.|\n(?!\n))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
        _paragraph:
          /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,
        text: /^[^\n]+/,
      };
      (eP._label = /(?!\s*\])(?:\\.|[^\[\]\\])+/),
        (eP._title =
          /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/),
        (eP.def = ed(eP.def)
          .replace('label', eP._label)
          .replace('title', eP._title)
          .getRegex()),
        (eP.bullet = /(?:[*+-]|\d{1,9}[.)])/),
        (eP.listItemStart = ed(/^( *)(bull) */)
          .replace('bull', eP.bullet)
          .getRegex()),
        (eP.list = ed(eP.list)
          .replace(/bull/g, eP.bullet)
          .replace(
            'hr',
            '\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))'
          )
          .replace('def', '\\n+(?=' + eP.def.source + ')')
          .getRegex()),
        (eP._tag =
          'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul'),
        (eP._comment = /<!--(?!-?>)[\s\S]*?(?:-->|$)/),
        (eP.html = ed(eP.html, 'i')
          .replace('comment', eP._comment)
          .replace('tag', eP._tag)
          .replace(
            'attribute',
            / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/
          )
          .getRegex()),
        (eP.paragraph = ed(eP._paragraph)
          .replace('hr', eP.hr)
          .replace('heading', ' {0,3}#{1,6} ')
          .replace('|lheading', '')
          .replace('|table', '')
          .replace('blockquote', ' {0,3}>')
          .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
          .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
          .replace(
            'html',
            '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)'
          )
          .replace('tag', eP._tag)
          .getRegex()),
        (eP.blockquote = ed(eP.blockquote)
          .replace('paragraph', eP.paragraph)
          .getRegex()),
        (eP.normal = { ...eP }),
        (eP.gfm = {
          ...eP.normal,
          table:
            '^ *([^\\n ].*\\|.*)\\n {0,3}(?:\\| *)?(:?-+:? *(?:\\| *:?-+:? *)*)(?:\\| *)?(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)',
        }),
        (eP.gfm.table = ed(eP.gfm.table)
          .replace('hr', eP.hr)
          .replace('heading', ' {0,3}#{1,6} ')
          .replace('blockquote', ' {0,3}>')
          .replace('code', ' {4}[^\\n]')
          .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
          .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
          .replace(
            'html',
            '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)'
          )
          .replace('tag', eP._tag)
          .getRegex()),
        (eP.gfm.paragraph = ed(eP._paragraph)
          .replace('hr', eP.hr)
          .replace('heading', ' {0,3}#{1,6} ')
          .replace('|lheading', '')
          .replace('table', eP.gfm.table)
          .replace('blockquote', ' {0,3}>')
          .replace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n')
          .replace('list', ' {0,3}(?:[*+-]|1[.)]) ')
          .replace(
            'html',
            '</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)'
          )
          .replace('tag', eP._tag)
          .getRegex()),
        (eP.pedantic = {
          ...eP.normal,
          html: ed(
            '^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|\'[^\']*\'|\\s[^\'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))'
          )
            .replace('comment', eP._comment)
            .replace(
              /tag/g,
              '(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b'
            )
            .getRegex(),
          def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
          heading: /^(#{1,6})(.*)(?:\n+|$)/,
          fences: ex,
          lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
          paragraph: ed(eP.normal._paragraph)
            .replace('hr', eP.hr)
            .replace('heading', ' *#{1,6} *[^\n]')
            .replace('lheading', eP.lheading)
            .replace('blockquote', ' {0,3}>')
            .replace('|fences', '')
            .replace('|list', '')
            .replace('|html', '')
            .getRegex(),
        });
      let eT = {
        escape: /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,
        autolink: /^<(scheme:[^\s\x00-\x1f<>]*|email)>/,
        url: ex,
        tag: '^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>',
        link: /^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/,
        reflink: /^!?\[(label)\]\[(ref)\]/,
        nolink: /^!?\[(ref)\](?:\[\])?/,
        reflinkSearch: 'reflink|nolink(?!\\()',
        emStrong: {
          lDelim: /^(?:\*+(?:([punct_])|[^\s*]))|^_+(?:([punct*])|([^\s_]))/,
          rDelimAst:
            /^(?:[^_*\\]|\\.)*?\_\_(?:[^_*\\]|\\.)*?\*(?:[^_*\\]|\\.)*?(?=\_\_)|(?:[^*\\]|\\.)+(?=[^*])|[punct_](\*+)(?=[\s]|$)|(?:[^punct*_\s\\]|\\.)(\*+)(?=[punct_\s]|$)|[punct_\s](\*+)(?=[^punct*_\s])|[\s](\*+)(?=[punct_])|[punct_](\*+)(?=[punct_])|(?:[^punct*_\s\\]|\\.)(\*+)(?=[^punct*_\s])/,
          rDelimUnd:
            /^(?:[^_*\\]|\\.)*?\*\*(?:[^_*\\]|\\.)*?\_(?:[^_*\\]|\\.)*?(?=\*\*)|(?:[^_\\]|\\.)+(?=[^_])|[punct*](\_+)(?=[\s]|$)|(?:[^punct*_\s\\]|\\.)(\_+)(?=[punct*\s]|$)|[punct*\s](\_+)(?=[^punct*_\s])|[\s](\_+)(?=[punct*])|[punct*](\_+)(?=[punct*])/,
        },
        code: /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,
        br: /^( {2,}|\\)\n(?!\s*$)/,
        del: ex,
        text: /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,
        punctuation: /^([\spunctuation])/,
      };
      function eN(e) {
        return e
          .replace(/---/g, '—')
          .replace(/--/g, '–')
          .replace(/(^|[-\u2014/(\[{"\s])'/g, '$1‘')
          .replace(/'/g, '’')
          .replace(/(^|[-\u2014/(\[{\u2018\s])"/g, '$1“')
          .replace(/"/g, '”')
          .replace(/\.{3}/g, '…');
      }
      function eA(e) {
        let t = '',
          n,
          r,
          s = e.length;
        for (n = 0; n < s; n++)
          (r = e.charCodeAt(n)),
            Math.random() > 0.5 && (r = 'x' + r.toString(16)),
            (t += '&#' + r + ';');
        return t;
      }
      (eT._punctuation = '!"#$%&\'()+\\-.,/:;<=>?@\\[\\]`^{|}~'),
        (eT.punctuation = ed(eT.punctuation)
          .replace(/punctuation/g, eT._punctuation)
          .getRegex()),
        (eT.blockSkip = /\[[^\]]*?\]\([^\)]*?\)|`[^`]*?`|<[^>]*?>/g),
        (eT.escapedEmSt = /(?:^|[^\\])(?:\\\\)*\\[*_]/g),
        (eT._comment = ed(eP._comment).replace('(?:-->|$)', '-->').getRegex()),
        (eT.emStrong.lDelim = ed(eT.emStrong.lDelim)
          .replace(/punct/g, eT._punctuation)
          .getRegex()),
        (eT.emStrong.rDelimAst = ed(eT.emStrong.rDelimAst, 'g')
          .replace(/punct/g, eT._punctuation)
          .getRegex()),
        (eT.emStrong.rDelimUnd = ed(eT.emStrong.rDelimUnd, 'g')
          .replace(/punct/g, eT._punctuation)
          .getRegex()),
        (eT._escapes = /\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g),
        (eT._scheme = /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/),
        (eT._email =
          /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/),
        (eT.autolink = ed(eT.autolink)
          .replace('scheme', eT._scheme)
          .replace('email', eT._email)
          .getRegex()),
        (eT._attribute =
          /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/),
        (eT.tag = ed(eT.tag)
          .replace('comment', eT._comment)
          .replace('attribute', eT._attribute)
          .getRegex()),
        (eT._label = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/),
        (eT._href = /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/),
        (eT._title =
          /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/),
        (eT.link = ed(eT.link)
          .replace('label', eT._label)
          .replace('href', eT._href)
          .replace('title', eT._title)
          .getRegex()),
        (eT.reflink = ed(eT.reflink)
          .replace('label', eT._label)
          .replace('ref', eP._label)
          .getRegex()),
        (eT.nolink = ed(eT.nolink).replace('ref', eP._label).getRegex()),
        (eT.reflinkSearch = ed(eT.reflinkSearch, 'g')
          .replace('reflink', eT.reflink)
          .replace('nolink', eT.nolink)
          .getRegex()),
        (eT.normal = { ...eT }),
        (eT.pedantic = {
          ...eT.normal,
          strong: {
            start: /^__|\*\*/,
            middle:
              /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
            endAst: /\*\*(?!\*)/g,
            endUnd: /__(?!_)/g,
          },
          em: {
            start: /^_|\*/,
            middle:
              /^()\*(?=\S)([\s\S]*?\S)\*(?!\*)|^_(?=\S)([\s\S]*?\S)_(?!_)/,
            endAst: /\*(?!\*)/g,
            endUnd: /_(?!_)/g,
          },
          link: ed(/^!?\[(label)\]\((.*?)\)/)
            .replace('label', eT._label)
            .getRegex(),
          reflink: ed(/^!?\[(label)\]\s*\[([^\]]*)\]/)
            .replace('label', eT._label)
            .getRegex(),
        }),
        (eT.gfm = {
          ...eT.normal,
          escape: ed(eT.escape).replace('])', '~|])').getRegex(),
          _extended_email:
            /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/,
          url: /^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,
          _backpedal:
            /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
          del: /^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,
          text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/,
        }),
        (eT.gfm.url = ed(eT.gfm.url, 'i')
          .replace('email', eT.gfm._extended_email)
          .getRegex()),
        (eT.breaks = {
          ...eT.gfm,
          br: ed(eT.br).replace('{2,}', '*').getRegex(),
          text: ed(eT.gfm.text)
            .replace('\\b_', '\\b_| {2,}\\n')
            .replace(/\{2,\}/g, '*')
            .getRegex(),
        });
      class eR {
        constructor(e) {
          (this.tokens = []),
            (this.tokens.links = Object.create(null)),
            (this.options = e || en),
            (this.options.tokenizer = this.options.tokenizer || new eL()),
            (this.tokenizer = this.options.tokenizer),
            (this.tokenizer.options = this.options),
            (this.tokenizer.lexer = this),
            (this.inlineQueue = []),
            (this.state = { inLink: !1, inRawBlock: !1, top: !0 });
          let t = { block: eP.normal, inline: eT.normal };
          this.options.pedantic
            ? ((t.block = eP.pedantic), (t.inline = eT.pedantic))
            : this.options.gfm &&
              ((t.block = eP.gfm),
              this.options.breaks
                ? (t.inline = eT.breaks)
                : (t.inline = eT.gfm)),
            (this.tokenizer.rules = t);
        }
        static get rules() {
          return { block: eP, inline: eT };
        }
        static lex(e, t) {
          let n = new eR(t);
          return n.lex(e);
        }
        static lexInline(e, t) {
          let n = new eR(t);
          return n.inlineTokens(e);
        }
        lex(e) {
          let t;
          for (
            e = e.replace(/\r\n|\r/g, '\n'), this.blockTokens(e, this.tokens);
            (t = this.inlineQueue.shift());

          )
            this.inlineTokens(t.src, t.tokens);
          return this.tokens;
        }
        blockTokens(e, t = []) {
          let n, r, s, a;
          for (
            e = this.options.pedantic
              ? e.replace(/\t/g, '    ').replace(/^ +$/gm, '')
              : e.replace(
                  /^( *)(\t+)/gm,
                  (e, t, n) => t + '    '.repeat(n.length)
                );
            e;

          )
            if (
              !(
                this.options.extensions &&
                this.options.extensions.block &&
                this.options.extensions.block.some(
                  r =>
                    !!(n = r.call({ lexer: this }, e, t)) &&
                    ((e = e.substring(n.raw.length)), t.push(n), !0)
                )
              )
            ) {
              if ((n = this.tokenizer.space(e))) {
                (e = e.substring(n.raw.length)),
                  1 === n.raw.length && t.length > 0
                    ? (t[t.length - 1].raw += '\n')
                    : t.push(n);
                continue;
              }
              if ((n = this.tokenizer.code(e))) {
                (e = e.substring(n.raw.length)),
                  (r = t[t.length - 1]) &&
                  ('paragraph' === r.type || 'text' === r.type)
                    ? ((r.raw += '\n' + n.raw),
                      (r.text += '\n' + n.text),
                      (this.inlineQueue[this.inlineQueue.length - 1].src =
                        r.text))
                    : t.push(n);
                continue;
              }
              if (
                (n = this.tokenizer.fences(e)) ||
                (n = this.tokenizer.heading(e)) ||
                (n = this.tokenizer.hr(e)) ||
                (n = this.tokenizer.blockquote(e)) ||
                (n = this.tokenizer.list(e)) ||
                (n = this.tokenizer.html(e))
              ) {
                (e = e.substring(n.raw.length)), t.push(n);
                continue;
              }
              if ((n = this.tokenizer.def(e))) {
                (e = e.substring(n.raw.length)),
                  (r = t[t.length - 1]) &&
                  ('paragraph' === r.type || 'text' === r.type)
                    ? ((r.raw += '\n' + n.raw),
                      (r.text += '\n' + n.raw),
                      (this.inlineQueue[this.inlineQueue.length - 1].src =
                        r.text))
                    : this.tokens.links[n.tag] ||
                      (this.tokens.links[n.tag] = {
                        href: n.href,
                        title: n.title,
                      });
                continue;
              }
              if (
                (n = this.tokenizer.table(e)) ||
                (n = this.tokenizer.lheading(e))
              ) {
                (e = e.substring(n.raw.length)), t.push(n);
                continue;
              }
              if (
                ((s = e),
                this.options.extensions && this.options.extensions.startBlock)
              ) {
                let t,
                  n = 1 / 0,
                  r = e.slice(1);
                this.options.extensions.startBlock.forEach(function (e) {
                  'number' == typeof (t = e.call({ lexer: this }, r)) &&
                    t >= 0 &&
                    (n = Math.min(n, t));
                }),
                  n < 1 / 0 && n >= 0 && (s = e.substring(0, n + 1));
              }
              if (this.state.top && (n = this.tokenizer.paragraph(s))) {
                (r = t[t.length - 1]),
                  a && 'paragraph' === r.type
                    ? ((r.raw += '\n' + n.raw),
                      (r.text += '\n' + n.text),
                      this.inlineQueue.pop(),
                      (this.inlineQueue[this.inlineQueue.length - 1].src =
                        r.text))
                    : t.push(n),
                  (a = s.length !== e.length),
                  (e = e.substring(n.raw.length));
                continue;
              }
              if ((n = this.tokenizer.text(e))) {
                (e = e.substring(n.raw.length)),
                  (r = t[t.length - 1]) && 'text' === r.type
                    ? ((r.raw += '\n' + n.raw),
                      (r.text += '\n' + n.text),
                      this.inlineQueue.pop(),
                      (this.inlineQueue[this.inlineQueue.length - 1].src =
                        r.text))
                    : t.push(n);
                continue;
              }
              if (e) {
                let t = 'Infinite loop on byte: ' + e.charCodeAt(0);
                if (this.options.silent) {
                  console.error(t);
                  break;
                }
                throw Error(t);
              }
            }
          return (this.state.top = !0), t;
        }
        inline(e, t = []) {
          return this.inlineQueue.push({ src: e, tokens: t }), t;
        }
        inlineTokens(e, t = []) {
          let n, r, s, a, i, o;
          let l = e;
          if (this.tokens.links) {
            let e = Object.keys(this.tokens.links);
            if (e.length > 0)
              for (
                ;
                null != (a = this.tokenizer.rules.inline.reflinkSearch.exec(l));

              )
                e.includes(a[0].slice(a[0].lastIndexOf('[') + 1, -1)) &&
                  (l =
                    l.slice(0, a.index) +
                    '[' +
                    ev('a', a[0].length - 2) +
                    ']' +
                    l.slice(
                      this.tokenizer.rules.inline.reflinkSearch.lastIndex
                    ));
          }
          for (; null != (a = this.tokenizer.rules.inline.blockSkip.exec(l)); )
            l =
              l.slice(0, a.index) +
              '[' +
              ev('a', a[0].length - 2) +
              ']' +
              l.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
          for (
            ;
            null != (a = this.tokenizer.rules.inline.escapedEmSt.exec(l));

          )
            (l =
              l.slice(0, a.index + a[0].length - 2) +
              '++' +
              l.slice(this.tokenizer.rules.inline.escapedEmSt.lastIndex)),
              this.tokenizer.rules.inline.escapedEmSt.lastIndex--;
          for (; e; )
            if (
              (i || (o = ''),
              (i = !1),
              !(
                this.options.extensions &&
                this.options.extensions.inline &&
                this.options.extensions.inline.some(
                  r =>
                    !!(n = r.call({ lexer: this }, e, t)) &&
                    ((e = e.substring(n.raw.length)), t.push(n), !0)
                )
              ))
            ) {
              if ((n = this.tokenizer.escape(e))) {
                (e = e.substring(n.raw.length)), t.push(n);
                continue;
              }
              if ((n = this.tokenizer.tag(e))) {
                (e = e.substring(n.raw.length)),
                  (r = t[t.length - 1]) &&
                  'text' === n.type &&
                  'text' === r.type
                    ? ((r.raw += n.raw), (r.text += n.text))
                    : t.push(n);
                continue;
              }
              if ((n = this.tokenizer.link(e))) {
                (e = e.substring(n.raw.length)), t.push(n);
                continue;
              }
              if ((n = this.tokenizer.reflink(e, this.tokens.links))) {
                (e = e.substring(n.raw.length)),
                  (r = t[t.length - 1]) &&
                  'text' === n.type &&
                  'text' === r.type
                    ? ((r.raw += n.raw), (r.text += n.text))
                    : t.push(n);
                continue;
              }
              if (
                (n = this.tokenizer.emStrong(e, l, o)) ||
                (n = this.tokenizer.codespan(e)) ||
                (n = this.tokenizer.br(e)) ||
                (n = this.tokenizer.del(e)) ||
                (n = this.tokenizer.autolink(e, eA)) ||
                (!this.state.inLink && (n = this.tokenizer.url(e, eA)))
              ) {
                (e = e.substring(n.raw.length)), t.push(n);
                continue;
              }
              if (
                ((s = e),
                this.options.extensions && this.options.extensions.startInline)
              ) {
                let t,
                  n = 1 / 0,
                  r = e.slice(1);
                this.options.extensions.startInline.forEach(function (e) {
                  'number' == typeof (t = e.call({ lexer: this }, r)) &&
                    t >= 0 &&
                    (n = Math.min(n, t));
                }),
                  n < 1 / 0 && n >= 0 && (s = e.substring(0, n + 1));
              }
              if ((n = this.tokenizer.inlineText(s, eN))) {
                (e = e.substring(n.raw.length)),
                  '_' !== n.raw.slice(-1) && (o = n.raw.slice(-1)),
                  (i = !0),
                  (r = t[t.length - 1]) && 'text' === r.type
                    ? ((r.raw += n.raw), (r.text += n.text))
                    : t.push(n);
                continue;
              }
              if (e) {
                let t = 'Infinite loop on byte: ' + e.charCodeAt(0);
                if (this.options.silent) {
                  console.error(t);
                  break;
                }
                throw Error(t);
              }
            }
          return t;
        }
      }
      class eE {
        constructor(e) {
          this.options = e || en;
        }
        code(e, t, n) {
          let r = (t || '').match(/\S*/)[0];
          if (this.options.highlight) {
            let t = this.options.highlight(e, r);
            null != t && t !== e && ((n = !0), (e = t));
          }
          return ((e = e.replace(/\n$/, '') + '\n'), r)
            ? '<pre><code class="' +
                this.options.langPrefix +
                ec(r) +
                '">' +
                (n ? e : ec(e, !0)) +
                '</code></pre>\n'
            : '<pre><code>' + (n ? e : ec(e, !0)) + '</code></pre>\n';
        }
        blockquote(e) {
          return `<blockquote>
${e}</blockquote>
`;
        }
        html(e) {
          return e;
        }
        heading(e, t, n, r) {
          if (this.options.headerIds) {
            let s = this.options.headerPrefix + r.slug(n);
            return `<h${t} id="${s}">${e}</h${t}>
`;
          }
          return `<h${t}>${e}</h${t}>
`;
        }
        hr() {
          return this.options.xhtml ? '<hr/>\n' : '<hr>\n';
        }
        list(e, t, n) {
          let r = t ? 'ol' : 'ul';
          return (
            '<' +
            r +
            (t && 1 !== n ? ' start="' + n + '"' : '') +
            '>\n' +
            e +
            '</' +
            r +
            '>\n'
          );
        }
        listitem(e) {
          return `<li>${e}</li>
`;
        }
        checkbox(e) {
          return (
            '<input ' +
            (e ? 'checked="" ' : '') +
            'disabled="" type="checkbox"' +
            (this.options.xhtml ? ' /' : '') +
            '> '
          );
        }
        paragraph(e) {
          return `<p>${e}</p>
`;
        }
        table(e, t) {
          return (
            t && (t = `<tbody>${t}</tbody>`),
            '<table>\n<thead>\n' + e + '</thead>\n' + t + '</table>\n'
          );
        }
        tablerow(e) {
          return `<tr>
${e}</tr>
`;
        }
        tablecell(e, t) {
          let n = t.header ? 'th' : 'td',
            r = t.align ? `<${n} align="${t.align}">` : `<${n}>`;
          return (
            r +
            e +
            `</${n}>
`
          );
        }
        strong(e) {
          return `<strong>${e}</strong>`;
        }
        em(e) {
          return `<em>${e}</em>`;
        }
        codespan(e) {
          return `<code>${e}</code>`;
        }
        br() {
          return this.options.xhtml ? '<br/>' : '<br>';
        }
        del(e) {
          return `<del>${e}</del>`;
        }
        link(e, t, n) {
          if (null === (e = em(this.options.sanitize, this.options.baseUrl, e)))
            return n;
          let r = '<a href="' + e + '"';
          return t && (r += ' title="' + t + '"'), (r += '>' + n + '</a>');
        }
        image(e, t, n) {
          if (null === (e = em(this.options.sanitize, this.options.baseUrl, e)))
            return n;
          let r = `<img src="${e}" alt="${n}"`;
          return (
            t && (r += ` title="${t}"`), (r += this.options.xhtml ? '/>' : '>')
          );
        }
        text(e) {
          return e;
        }
      }
      class ej {
        strong(e) {
          return e;
        }
        em(e) {
          return e;
        }
        codespan(e) {
          return e;
        }
        del(e) {
          return e;
        }
        html(e) {
          return e;
        }
        text(e) {
          return e;
        }
        link(e, t, n) {
          return '' + n;
        }
        image(e, t, n) {
          return '' + n;
        }
        br() {
          return '';
        }
      }
      class eI {
        constructor() {
          this.seen = {};
        }
        serialize(e) {
          return e
            .toLowerCase()
            .trim()
            .replace(/<[!\/a-z].*?>/gi, '')
            .replace(
              /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g,
              ''
            )
            .replace(/\s/g, '-');
        }
        getNextSafeSlug(e, t) {
          let n = e,
            r = 0;
          if (this.seen.hasOwnProperty(n)) {
            r = this.seen[e];
            do n = e + '-' + ++r;
            while (this.seen.hasOwnProperty(n));
          }
          return t || ((this.seen[e] = r), (this.seen[n] = 0)), n;
        }
        slug(e, t = {}) {
          let n = this.serialize(e);
          return this.getNextSafeSlug(n, t.dryrun);
        }
      }
      class e$ {
        constructor(e) {
          (this.options = e || en),
            (this.options.renderer = this.options.renderer || new eE()),
            (this.renderer = this.options.renderer),
            (this.renderer.options = this.options),
            (this.textRenderer = new ej()),
            (this.slugger = new eI());
        }
        static parse(e, t) {
          let n = new e$(t);
          return n.parse(e);
        }
        static parseInline(e, t) {
          let n = new e$(t);
          return n.parseInline(e);
        }
        parse(e, t = !0) {
          let n = '',
            r,
            s,
            a,
            i,
            o,
            l,
            c,
            u,
            h,
            p,
            d,
            f,
            g,
            m,
            b,
            k,
            y,
            _,
            x,
            w = e.length;
          for (r = 0; r < w; r++) {
            if (
              ((p = e[r]),
              this.options.extensions &&
                this.options.extensions.renderers &&
                this.options.extensions.renderers[p.type] &&
                (!1 !==
                  (x = this.options.extensions.renderers[p.type].call(
                    { parser: this },
                    p
                  )) ||
                  ![
                    'space',
                    'hr',
                    'heading',
                    'code',
                    'table',
                    'blockquote',
                    'list',
                    'html',
                    'paragraph',
                    'text',
                  ].includes(p.type)))
            ) {
              n += x || '';
              continue;
            }
            switch (p.type) {
              case 'space':
                continue;
              case 'hr':
                n += this.renderer.hr();
                continue;
              case 'heading':
                n += this.renderer.heading(
                  this.parseInline(p.tokens),
                  p.depth,
                  eh(this.parseInline(p.tokens, this.textRenderer)),
                  this.slugger
                );
                continue;
              case 'code':
                n += this.renderer.code(p.text, p.lang, p.escaped);
                continue;
              case 'table':
                for (s = 0, u = '', c = '', i = p.header.length; s < i; s++)
                  c += this.renderer.tablecell(
                    this.parseInline(p.header[s].tokens),
                    { header: !0, align: p.align[s] }
                  );
                for (
                  u += this.renderer.tablerow(c),
                    h = '',
                    i = p.rows.length,
                    s = 0;
                  s < i;
                  s++
                ) {
                  for (a = 0, l = p.rows[s], c = '', o = l.length; a < o; a++)
                    c += this.renderer.tablecell(
                      this.parseInline(l[a].tokens),
                      { header: !1, align: p.align[a] }
                    );
                  h += this.renderer.tablerow(c);
                }
                n += this.renderer.table(u, h);
                continue;
              case 'blockquote':
                (h = this.parse(p.tokens)), (n += this.renderer.blockquote(h));
                continue;
              case 'list':
                for (
                  s = 0,
                    d = p.ordered,
                    f = p.start,
                    g = p.loose,
                    i = p.items.length,
                    h = '';
                  s < i;
                  s++
                )
                  (k = (b = p.items[s]).checked),
                    (y = b.task),
                    (m = ''),
                    b.task &&
                      ((_ = this.renderer.checkbox(k)),
                      g
                        ? b.tokens.length > 0 &&
                          'paragraph' === b.tokens[0].type
                          ? ((b.tokens[0].text = _ + ' ' + b.tokens[0].text),
                            b.tokens[0].tokens &&
                              b.tokens[0].tokens.length > 0 &&
                              'text' === b.tokens[0].tokens[0].type &&
                              (b.tokens[0].tokens[0].text =
                                _ + ' ' + b.tokens[0].tokens[0].text))
                          : b.tokens.unshift({ type: 'text', text: _ })
                        : (m += _)),
                    (m += this.parse(b.tokens, g)),
                    (h += this.renderer.listitem(m, y, k));
                n += this.renderer.list(h, d, f);
                continue;
              case 'html':
                n += this.renderer.html(p.text);
                continue;
              case 'paragraph':
                n += this.renderer.paragraph(this.parseInline(p.tokens));
                continue;
              case 'text':
                for (
                  h = p.tokens ? this.parseInline(p.tokens) : p.text;
                  r + 1 < w && 'text' === e[r + 1].type;

                )
                  h +=
                    '\n' +
                    ((p = e[++r]).tokens ? this.parseInline(p.tokens) : p.text);
                n += t ? this.renderer.paragraph(h) : h;
                continue;
              default: {
                let e = 'Token with "' + p.type + '" type was not found.';
                if (this.options.silent) {
                  console.error(e);
                  return;
                }
                throw Error(e);
              }
            }
          }
          return n;
        }
        parseInline(e, t) {
          t = t || this.renderer;
          let n = '',
            r,
            s,
            a,
            i = e.length;
          for (r = 0; r < i; r++) {
            if (
              ((s = e[r]),
              this.options.extensions &&
                this.options.extensions.renderers &&
                this.options.extensions.renderers[s.type] &&
                (!1 !==
                  (a = this.options.extensions.renderers[s.type].call(
                    { parser: this },
                    s
                  )) ||
                  ![
                    'escape',
                    'html',
                    'link',
                    'image',
                    'strong',
                    'em',
                    'codespan',
                    'br',
                    'del',
                    'text',
                  ].includes(s.type)))
            ) {
              n += a || '';
              continue;
            }
            switch (s.type) {
              case 'escape':
              case 'text':
                n += t.text(s.text);
                break;
              case 'html':
                n += t.html(s.text);
                break;
              case 'link':
                n += t.link(s.href, s.title, this.parseInline(s.tokens, t));
                break;
              case 'image':
                n += t.image(s.href, s.title, s.text);
                break;
              case 'strong':
                n += t.strong(this.parseInline(s.tokens, t));
                break;
              case 'em':
                n += t.em(this.parseInline(s.tokens, t));
                break;
              case 'codespan':
                n += t.codespan(s.text);
                break;
              case 'br':
                n += t.br();
                break;
              case 'del':
                n += t.del(this.parseInline(s.tokens, t));
                break;
              default: {
                let e = 'Token with "' + s.type + '" type was not found.';
                if (this.options.silent) {
                  console.error(e);
                  return;
                }
                throw Error(e);
              }
            }
          }
          return n;
        }
      }
      class eO {
        constructor(e) {
          this.options = e || en;
        }
        static passThroughHooks = new Set(['preprocess', 'postprocess']);
        preprocess(e) {
          return e;
        }
        postprocess(e) {
          return e;
        }
      }
      function eB(e, t) {
        return (n, r, s) => {
          var a, i, o, l;
          'function' == typeof r && ((s = r), (r = null));
          let c = { ...r };
          r = { ...eM.defaults, ...c };
          let u =
            ((a = r.silent),
            (i = r.async),
            (o = s),
            e => {
              if (
                ((e.message +=
                  '\nPlease report this to https://github.com/markedjs/marked.'),
                a)
              ) {
                let t =
                  '<p>An error occurred:</p><pre>' +
                  ec(e.message + '', !0) +
                  '</pre>';
                if (i) return Promise.resolve(t);
                if (o) {
                  o(null, t);
                  return;
                }
                return t;
              }
              if (i) return Promise.reject(e);
              if (o) {
                o(e);
                return;
              }
              throw e;
            });
          if (null == n)
            return u(Error('marked(): input parameter is undefined or null'));
          if ('string' != typeof n)
            return u(
              Error(
                'marked(): input parameter is of type ' +
                  Object.prototype.toString.call(n) +
                  ', string expected'
              )
            );
          if (
            ((l = r) &&
              l.sanitize &&
              !l.silent &&
              console.warn(
                'marked(): sanitize and sanitizer parameters are deprecated since version 0.7.0, should not be used and will be removed in the future. Read more here: https://marked.js.org/#/USING_ADVANCED.md#options'
              ),
            r.hooks && (r.hooks.options = r),
            s)
          ) {
            let a;
            let i = r.highlight;
            try {
              r.hooks && (n = r.hooks.preprocess(n)), (a = e(n, r));
            } catch (e) {
              return u(e);
            }
            let o = function (e) {
              let n;
              if (!e)
                try {
                  r.walkTokens && eM.walkTokens(a, r.walkTokens),
                    (n = t(a, r)),
                    r.hooks && (n = r.hooks.postprocess(n));
                } catch (t) {
                  e = t;
                }
              return (r.highlight = i), e ? u(e) : s(null, n);
            };
            if (!i || i.length < 3 || (delete r.highlight, !a.length))
              return o();
            let l = 0;
            return (
              eM.walkTokens(a, function (e) {
                'code' === e.type &&
                  (l++,
                  setTimeout(() => {
                    i(e.text, e.lang, function (t, n) {
                      if (t) return o(t);
                      null != n &&
                        n !== e.text &&
                        ((e.text = n), (e.escaped = !0)),
                        0 == --l && o();
                    });
                  }, 0));
              }),
              void (0 === l && o())
            );
          }
          if (r.async)
            return Promise.resolve(r.hooks ? r.hooks.preprocess(n) : n)
              .then(t => e(t, r))
              .then(e =>
                r.walkTokens
                  ? Promise.all(eM.walkTokens(e, r.walkTokens)).then(() => e)
                  : e
              )
              .then(e => t(e, r))
              .then(e => (r.hooks ? r.hooks.postprocess(e) : e))
              .catch(u);
          try {
            r.hooks && (n = r.hooks.preprocess(n));
            let s = e(n, r);
            r.walkTokens && eM.walkTokens(s, r.walkTokens);
            let a = t(s, r);
            return r.hooks && (a = r.hooks.postprocess(a)), a;
          } catch (e) {
            return u(e);
          }
        };
      }
      function eM(e, t, n) {
        return eB(eR.lex, e$.parse)(e, t, n);
      }
      (eM.options = eM.setOptions =
        function (e) {
          return (
            (eM.defaults = { ...eM.defaults, ...e }), (en = eM.defaults), eM
          );
        }),
        (eM.getDefaults = et),
        (eM.defaults = en),
        (eM.use = function (...e) {
          let t = eM.defaults.extensions || { renderers: {}, childTokens: {} };
          e.forEach(e => {
            let n = { ...e };
            if (
              ((n.async = eM.defaults.async || n.async || !1),
              e.extensions &&
                (e.extensions.forEach(e => {
                  if (!e.name) throw Error('extension name required');
                  if (e.renderer) {
                    let n = t.renderers[e.name];
                    n
                      ? (t.renderers[e.name] = function (...t) {
                          let r = e.renderer.apply(this, t);
                          return !1 === r && (r = n.apply(this, t)), r;
                        })
                      : (t.renderers[e.name] = e.renderer);
                  }
                  if (e.tokenizer) {
                    if (
                      !e.level ||
                      ('block' !== e.level && 'inline' !== e.level)
                    )
                      throw Error(
                        "extension level must be 'block' or 'inline'"
                      );
                    t[e.level]
                      ? t[e.level].unshift(e.tokenizer)
                      : (t[e.level] = [e.tokenizer]),
                      e.start &&
                        ('block' === e.level
                          ? t.startBlock
                            ? t.startBlock.push(e.start)
                            : (t.startBlock = [e.start])
                          : 'inline' === e.level &&
                            (t.startInline
                              ? t.startInline.push(e.start)
                              : (t.startInline = [e.start])));
                  }
                  e.childTokens && (t.childTokens[e.name] = e.childTokens);
                }),
                (n.extensions = t)),
              e.renderer)
            ) {
              let t = eM.defaults.renderer || new eE();
              for (let n in e.renderer) {
                let r = t[n];
                t[n] = (...s) => {
                  let a = e.renderer[n].apply(t, s);
                  return !1 === a && (a = r.apply(t, s)), a;
                };
              }
              n.renderer = t;
            }
            if (e.tokenizer) {
              let t = eM.defaults.tokenizer || new eL();
              for (let n in e.tokenizer) {
                let r = t[n];
                t[n] = (...s) => {
                  let a = e.tokenizer[n].apply(t, s);
                  return !1 === a && (a = r.apply(t, s)), a;
                };
              }
              n.tokenizer = t;
            }
            if (e.hooks) {
              let t = eM.defaults.hooks || new eO();
              for (let n in e.hooks) {
                let r = t[n];
                eO.passThroughHooks.has(n)
                  ? (t[n] = s => {
                      if (eM.defaults.async)
                        return Promise.resolve(e.hooks[n].call(t, s)).then(e =>
                          r.call(t, e)
                        );
                      let a = e.hooks[n].call(t, s);
                      return r.call(t, a);
                    })
                  : (t[n] = (...s) => {
                      let a = e.hooks[n].apply(t, s);
                      return !1 === a && (a = r.apply(t, s)), a;
                    });
              }
              n.hooks = t;
            }
            if (e.walkTokens) {
              let t = eM.defaults.walkTokens;
              n.walkTokens = function (n) {
                let r = [];
                return (
                  r.push(e.walkTokens.call(this, n)),
                  t && (r = r.concat(t.call(this, n))),
                  r
                );
              };
            }
            eM.setOptions(n);
          });
        }),
        (eM.walkTokens = function (e, t) {
          let n = [];
          for (let r of e)
            switch (((n = n.concat(t.call(eM, r))), r.type)) {
              case 'table':
                for (let e of r.header)
                  n = n.concat(eM.walkTokens(e.tokens, t));
                for (let e of r.rows)
                  for (let r of e) n = n.concat(eM.walkTokens(r.tokens, t));
                break;
              case 'list':
                n = n.concat(eM.walkTokens(r.items, t));
                break;
              default:
                eM.defaults.extensions &&
                eM.defaults.extensions.childTokens &&
                eM.defaults.extensions.childTokens[r.type]
                  ? eM.defaults.extensions.childTokens[r.type].forEach(
                      function (e) {
                        n = n.concat(eM.walkTokens(r[e], t));
                      }
                    )
                  : r.tokens && (n = n.concat(eM.walkTokens(r.tokens, t)));
            }
          return n;
        }),
        (eM.parseInline = eB(eR.lexInline, e$.parseInline)),
        (eM.Parser = e$),
        (eM.parser = e$.parse),
        (eM.Renderer = eE),
        (eM.TextRenderer = ej),
        (eM.Lexer = eR),
        (eM.lexer = eR.lex),
        (eM.Tokenizer = eL),
        (eM.Slugger = eI),
        (eM.Hooks = eO),
        (eM.parse = eM),
        eM.options,
        eM.setOptions,
        eM.use,
        eM.walkTokens,
        eM.parseInline,
        e$.parse,
        eR.lex;
      var eD = n(13210),
        eF = n(65024),
        eG = n(67072);
      function eH(e, t) {
        return Array(t + 1).join(e);
      }
      var eU = [
        'ADDRESS',
        'ARTICLE',
        'ASIDE',
        'AUDIO',
        'BLOCKQUOTE',
        'BODY',
        'CANVAS',
        'CENTER',
        'DD',
        'DIR',
        'DIV',
        'DL',
        'DT',
        'FIELDSET',
        'FIGCAPTION',
        'FIGURE',
        'FOOTER',
        'FORM',
        'FRAMESET',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'HEADER',
        'HGROUP',
        'HR',
        'HTML',
        'ISINDEX',
        'LI',
        'MAIN',
        'MENU',
        'NAV',
        'NOFRAMES',
        'NOSCRIPT',
        'OL',
        'OUTPUT',
        'P',
        'PRE',
        'SECTION',
        'TABLE',
        'TBODY',
        'TD',
        'TFOOT',
        'TH',
        'THEAD',
        'TR',
        'UL',
      ];
      function ez(e) {
        return eQ(e, eU);
      }
      var eq = [
        'AREA',
        'BASE',
        'BR',
        'COL',
        'COMMAND',
        'EMBED',
        'HR',
        'IMG',
        'INPUT',
        'KEYGEN',
        'LINK',
        'META',
        'PARAM',
        'SOURCE',
        'TRACK',
        'WBR',
      ];
      function eW(e) {
        return eQ(e, eq);
      }
      var eV = [
        'A',
        'TABLE',
        'THEAD',
        'TBODY',
        'TFOOT',
        'TH',
        'TD',
        'IFRAME',
        'SCRIPT',
        'AUDIO',
        'VIDEO',
      ];
      function eQ(e, t) {
        return t.indexOf(e.nodeName) >= 0;
      }
      function eK(e, t) {
        return (
          e.getElementsByTagName &&
          t.some(function (t) {
            return e.getElementsByTagName(t).length;
          })
        );
      }
      var eZ = {};
      function eY(e) {
        return e ? e.replace(/(\n+\s*)+/g, '\n') : '';
      }
      function eX(e) {
        for (var t in ((this.options = e),
        (this._keep = []),
        (this._remove = []),
        (this.blankRule = { replacement: e.blankReplacement }),
        (this.keepReplacement = e.keepReplacement),
        (this.defaultRule = { replacement: e.defaultReplacement }),
        (this.array = []),
        e.rules))
          this.array.push(e.rules[t]);
      }
      function eJ(e, t, n) {
        for (var r = 0; r < e.length; r++) {
          var s = e[r];
          if (
            (function (e, t, n) {
              var r = e.filter;
              if ('string' == typeof r) {
                if (r === t.nodeName.toLowerCase()) return !0;
              } else if (Array.isArray(r)) {
                if (r.indexOf(t.nodeName.toLowerCase()) > -1) return !0;
              } else if ('function' == typeof r) {
                if (r.call(e, t, n)) return !0;
              } else
                throw TypeError(
                  '`filter` needs to be a string, array, or function'
                );
            })(s, t, n)
          )
            return s;
        }
      }
      function e0(e) {
        var t = e.nextSibling || e.parentNode;
        return e.parentNode.removeChild(e), t;
      }
      function e1(e, t, n) {
        return (e && e.parentNode === t) || n(t)
          ? t.nextSibling || t.parentNode
          : t.firstChild || t.nextSibling || t.parentNode;
      }
      (eZ.paragraph = {
        filter: 'p',
        replacement: function (e) {
          return '\n\n' + e + '\n\n';
        },
      }),
        (eZ.lineBreak = {
          filter: 'br',
          replacement: function (e, t, n) {
            return n.br + '\n';
          },
        }),
        (eZ.heading = {
          filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
          replacement: function (e, t, n) {
            var r = Number(t.nodeName.charAt(1));
            if ('setext' !== n.headingStyle || !(r < 3))
              return '\n\n' + eH('#', r) + ' ' + e + '\n\n';
            var s = eH(1 === r ? '=' : '-', e.length);
            return '\n\n' + e + '\n' + s + '\n\n';
          },
        }),
        (eZ.blockquote = {
          filter: 'blockquote',
          replacement: function (e) {
            return (
              '\n\n' +
              (e = (e = e.replace(/^\n+|\n+$/g, '')).replace(/^/gm, '> ')) +
              '\n\n'
            );
          },
        }),
        (eZ.list = {
          filter: ['ul', 'ol'],
          replacement: function (e, t) {
            var n = t.parentNode;
            return 'LI' === n.nodeName && n.lastElementChild === t
              ? '\n' + e
              : '\n\n' + e + '\n\n';
          },
        }),
        (eZ.listItem = {
          filter: 'li',
          replacement: function (e, t, n) {
            e = e
              .replace(/^\n+/, '')
              .replace(/\n+$/, '\n')
              .replace(/\n/gm, '\n    ');
            var r = n.bulletListMarker + '   ',
              s = t.parentNode;
            if ('OL' === s.nodeName) {
              var a = s.getAttribute('start'),
                i = Array.prototype.indexOf.call(s.children, t);
              r = (a ? Number(a) + i : i + 1) + '.  ';
            }
            return r + e + (t.nextSibling && !/\n$/.test(e) ? '\n' : '');
          },
        }),
        (eZ.indentedCodeBlock = {
          filter: function (e, t) {
            return (
              'indented' === t.codeBlockStyle &&
              'PRE' === e.nodeName &&
              e.firstChild &&
              'CODE' === e.firstChild.nodeName
            );
          },
          replacement: function (e, t, n) {
            return (
              '\n\n    ' +
              t.firstChild.textContent.replace(/\n/g, '\n    ') +
              '\n\n'
            );
          },
        }),
        (eZ.fencedCodeBlock = {
          filter: function (e, t) {
            return (
              'fenced' === t.codeBlockStyle &&
              'PRE' === e.nodeName &&
              e.firstChild &&
              'CODE' === e.firstChild.nodeName
            );
          },
          replacement: function (e, t, n) {
            for (
              var r,
                s = ((t.firstChild.getAttribute('class') || '').match(
                  /language-(\S+)/
                ) || [null, ''])[1],
                a = t.firstChild.textContent,
                i = n.fence.charAt(0),
                o = 3,
                l = RegExp('^' + i + '{3,}', 'gm');
              (r = l.exec(a));

            )
              r[0].length >= o && (o = r[0].length + 1);
            var c = eH(i, o);
            return (
              '\n\n' + c + s + '\n' + a.replace(/\n$/, '') + '\n' + c + '\n\n'
            );
          },
        }),
        (eZ.horizontalRule = {
          filter: 'hr',
          replacement: function (e, t, n) {
            return '\n\n' + n.hr + '\n\n';
          },
        }),
        (eZ.inlineLink = {
          filter: function (e, t) {
            return (
              'inlined' === t.linkStyle &&
              'A' === e.nodeName &&
              e.getAttribute('href')
            );
          },
          replacement: function (e, t) {
            var n = t.getAttribute('href'),
              r = eY(t.getAttribute('title'));
            return r && (r = ' "' + r + '"'), '[' + e + '](' + n + r + ')';
          },
        }),
        (eZ.referenceLink = {
          filter: function (e, t) {
            return (
              'referenced' === t.linkStyle &&
              'A' === e.nodeName &&
              e.getAttribute('href')
            );
          },
          replacement: function (e, t, n) {
            var r,
              s,
              a = t.getAttribute('href'),
              i = eY(t.getAttribute('title'));
            switch ((i && (i = ' "' + i + '"'), n.linkReferenceStyle)) {
              case 'collapsed':
                (r = '[' + e + '][]'), (s = '[' + e + ']: ' + a + i);
                break;
              case 'shortcut':
                (r = '[' + e + ']'), (s = '[' + e + ']: ' + a + i);
                break;
              default:
                var o = this.references.length + 1;
                (r = '[' + e + '][' + o + ']'), (s = '[' + o + ']: ' + a + i);
            }
            return this.references.push(s), r;
          },
          references: [],
          append: function (e) {
            var t = '';
            return (
              this.references.length &&
                ((t = '\n\n' + this.references.join('\n') + '\n\n'),
                (this.references = [])),
              t
            );
          },
        }),
        (eZ.emphasis = {
          filter: ['em', 'i'],
          replacement: function (e, t, n) {
            return e.trim() ? n.emDelimiter + e + n.emDelimiter : '';
          },
        }),
        (eZ.strong = {
          filter: ['strong', 'b'],
          replacement: function (e, t, n) {
            return e.trim() ? n.strongDelimiter + e + n.strongDelimiter : '';
          },
        }),
        (eZ.code = {
          filter: function (e) {
            var t = e.previousSibling || e.nextSibling,
              n = 'PRE' === e.parentNode.nodeName && !t;
            return 'CODE' === e.nodeName && !n;
          },
          replacement: function (e) {
            if (!e) return '';
            e = e.replace(/\r?\n|\r/g, ' ');
            for (
              var t = /^`|^ .*?[^ ].* $|`$/.test(e) ? ' ' : '',
                n = '`',
                r = e.match(/`+/gm) || [];
              -1 !== r.indexOf(n);

            )
              n += '`';
            return n + t + e + t + n;
          },
        }),
        (eZ.image = {
          filter: 'img',
          replacement: function (e, t) {
            var n = eY(t.getAttribute('alt')),
              r = t.getAttribute('src') || '',
              s = eY(t.getAttribute('title'));
            return r
              ? '![' + n + '](' + r + (s ? ' "' + s + '"' : '') + ')'
              : '';
          },
        }),
        (eX.prototype = {
          add: function (e, t) {
            this.array.unshift(t);
          },
          keep: function (e) {
            this._keep.unshift({
              filter: e,
              replacement: this.keepReplacement,
            });
          },
          remove: function (e) {
            this._remove.unshift({
              filter: e,
              replacement: function () {
                return '';
              },
            });
          },
          forNode: function (e) {
            var t;
            return e.isBlank
              ? this.blankRule
              : (t = eJ(this.array, e, this.options)) ||
                (t = eJ(this._keep, e, this.options)) ||
                (t = eJ(this._remove, e, this.options))
              ? t
              : this.defaultRule;
          },
          forEach: function (e) {
            for (var t = 0; t < this.array.length; t++) e(this.array[t], t);
          },
        });
      var e2 = 'undefined' != typeof window ? window : {},
        e3 = !(function () {
          var e = e2.DOMParser,
            t = !1;
          try {
            new e().parseFromString('', 'text/html') && (t = !0);
          } catch (e) {}
          return t;
        })()
          ? ((r = function () {}),
            !(function () {
              var e = !1;
              try {
                document.implementation.createHTMLDocument('').open();
              } catch (t) {
                window.ActiveXObject && (e = !0);
              }
              return e;
            })()
              ? (r.prototype.parseFromString = function (e) {
                  var t = document.implementation.createHTMLDocument('');
                  return t.open(), t.write(e), t.close(), t;
                })
              : (r.prototype.parseFromString = function (e) {
                  var t = new window.ActiveXObject('htmlfile');
                  return (
                    (t.designMode = 'on'), t.open(), t.write(e), t.close(), t
                  );
                }),
            r)
          : e2.DOMParser;
      function e4(e, t) {
        var n;
        return (
          !(function (e) {
            var t = e.element,
              n = e.isBlock,
              r = e.isVoid,
              s =
                e.isPre ||
                function (e) {
                  return 'PRE' === e.nodeName;
                };
            if (!(!t.firstChild || s(t))) {
              for (
                var a = null, i = !1, o = null, l = e1(null, t, s);
                l !== t;

              ) {
                if (3 === l.nodeType || 4 === l.nodeType) {
                  var c = l.data.replace(/[ \r\n\t]+/g, ' ');
                  if (
                    ((!a || / $/.test(a.data)) &&
                      !i &&
                      ' ' === c[0] &&
                      (c = c.substr(1)),
                    !c)
                  ) {
                    l = e0(l);
                    continue;
                  }
                  (l.data = c), (a = l);
                } else if (1 === l.nodeType)
                  n(l) || 'BR' === l.nodeName
                    ? (a && (a.data = a.data.replace(/ $/, '')),
                      (a = null),
                      (i = !1))
                    : r(l) || s(l)
                    ? ((a = null), (i = !0))
                    : a && (i = !1);
                else {
                  l = e0(l);
                  continue;
                }
                var u = e1(o, l, s);
                (o = l), (l = u);
              }
              a && ((a.data = a.data.replace(/ $/, '')), a.data || e0(a));
            }
          })({
            element: (n =
              'string' == typeof e
                ? (s = s || new e3())
                    .parseFromString(
                      '<x-turndown id="turndown-root">' + e + '</x-turndown>',
                      'text/html'
                    )
                    .getElementById('turndown-root')
                : e.cloneNode(!0)),
            isBlock: ez,
            isVoid: eW,
            isPre: t.preformattedCode ? e6 : null,
          }),
          n
        );
      }
      function e6(e) {
        return 'PRE' === e.nodeName || 'CODE' === e.nodeName;
      }
      function e8(e, t) {
        return (
          (e.isBlock = ez(e)),
          (e.isCode = 'CODE' === e.nodeName || e.parentNode.isCode),
          (e.isBlank =
            !eW(e) &&
            !eQ(e, eV) &&
            /^\s*$/i.test(e.textContent) &&
            !eK(e, eq) &&
            !eK(e, eV)),
          (e.flankingWhitespace = (function (e, t) {
            if (e.isBlock || (t.preformattedCode && e.isCode))
              return { leading: '', trailing: '' };
            var n,
              r = {
                leading: (n = e.textContent.match(
                  /^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/
                ))[1],
                leadingAscii: n[2],
                leadingNonAscii: n[3],
                trailing: n[4],
                trailingNonAscii: n[5],
                trailingAscii: n[6],
              };
            return (
              r.leadingAscii &&
                e5('left', e, t) &&
                (r.leading = r.leadingNonAscii),
              r.trailingAscii &&
                e5('right', e, t) &&
                (r.trailing = r.trailingNonAscii),
              { leading: r.leading, trailing: r.trailing }
            );
          })(e, t)),
          e
        );
      }
      function e5(e, t, n) {
        var r, s, a;
        return (
          'left' === e
            ? ((r = t.previousSibling), (s = / $/))
            : ((r = t.nextSibling), (s = /^ /)),
          r &&
            (3 === r.nodeType
              ? (a = s.test(r.nodeValue))
              : n.preformattedCode && 'CODE' === r.nodeName
              ? (a = !1)
              : 1 !== r.nodeType || ez(r) || (a = s.test(r.textContent))),
          a
        );
      }
      var e9 = Array.prototype.reduce,
        e7 = [
          [/\\/g, '\\\\'],
          [/\*/g, '\\*'],
          [/^-/g, '\\-'],
          [/^\+ /g, '\\+ '],
          [/^(=+)/g, '\\$1'],
          [/^(#{1,6}) /g, '\\$1 '],
          [/`/g, '\\`'],
          [/^~~~/g, '\\~~~'],
          [/\[/g, '\\['],
          [/\]/g, '\\]'],
          [/^>/g, '\\>'],
          [/_/g, '\\_'],
          [/^(\d+)\. /g, '$1\\. '],
        ];
      function te(e) {
        if (!(this instanceof te)) return new te(e);
        (this.options = (function (e) {
          for (var t = 1; t < arguments.length; t++) {
            var n = arguments[t];
            for (var r in n) n.hasOwnProperty(r) && (e[r] = n[r]);
          }
          return e;
        })(
          {},
          {
            rules: eZ,
            headingStyle: 'setext',
            hr: '* * *',
            bulletListMarker: '*',
            codeBlockStyle: 'indented',
            fence: '```',
            emDelimiter: '_',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full',
            br: '  ',
            preformattedCode: !1,
            blankReplacement: function (e, t) {
              return t.isBlock ? '\n\n' : '';
            },
            keepReplacement: function (e, t) {
              return t.isBlock ? '\n\n' + t.outerHTML + '\n\n' : t.outerHTML;
            },
            defaultReplacement: function (e, t) {
              return t.isBlock ? '\n\n' + e + '\n\n' : e;
            },
          },
          e
        )),
          (this.rules = new eX(this.options));
      }
      function tt(e) {
        var t = this;
        return e9.call(
          e.childNodes,
          function (e, n) {
            n = new e8(n, t.options);
            var r = '';
            return (
              3 === n.nodeType
                ? (r = n.isCode ? n.nodeValue : t.escape(n.nodeValue))
                : 1 === n.nodeType && (r = tr.call(t, n)),
              ts(e, r)
            );
          },
          ''
        );
      }
      function tn(e) {
        var t = this;
        return (
          this.rules.forEach(function (n) {
            'function' == typeof n.append && (e = ts(e, n.append(t.options)));
          }),
          e.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
        );
      }
      function tr(e) {
        var t = this.rules.forNode(e),
          n = tt.call(this, e),
          r = e.flankingWhitespace;
        return (
          (r.leading || r.trailing) && (n = n.trim()),
          r.leading + t.replacement(n, e, this.options) + r.trailing
        );
      }
      function ts(e, t) {
        var n = (function (e) {
            for (var t = e.length; t > 0 && '\n' === e[t - 1]; ) t--;
            return e.substring(0, t);
          })(e),
          r = t.replace(/^\n*/, ''),
          s = Math.max(e.length - n.length, t.length - r.length);
        return n + '\n\n'.substring(0, s) + r;
      }
      te.prototype = {
        turndown: function (e) {
          if (
            !(
              null != e &&
              ('string' == typeof e ||
                (e.nodeType &&
                  (1 === e.nodeType || 9 === e.nodeType || 11 === e.nodeType)))
            )
          )
            throw TypeError(
              e + ' is not a string, or an element/document/fragment node.'
            );
          return '' === e
            ? ''
            : tn.call(this, tt.call(this, new e4(e, this.options)));
        },
        use: function (e) {
          if (Array.isArray(e))
            for (var t = 0; t < e.length; t++) this.use(e[t]);
          else if ('function' == typeof e) e(this);
          else
            throw TypeError(
              'plugin must be a Function or an Array of Functions'
            );
          return this;
        },
        addRule: function (e, t) {
          return this.rules.add(e, t), this;
        },
        keep: function (e) {
          return this.rules.keep(e), this;
        },
        remove: function (e) {
          return this.rules.remove(e), this;
        },
        escape: function (e) {
          return e7.reduce(function (e, t) {
            return e.replace(t[0], t[1]);
          }, e);
        },
      };
      var ta = n(15486);
      let ti = ta.iv`
  :root {
    --affine-editor-width: ${eG.Y9}px;

    --affine-theme-mode: light;
    --affine-editor-mode: page;
    /* --affine-palette-transparent: special values added for the sake of logical consistency. */
    --affine-palette-transparent: #00000000;

    --affine-popover-shadow: 0px 1px 10px -6px rgba(24, 39, 75, 0.08),
      0px 3px 16px -6px rgba(24, 39, 75, 0.04);
    --affine-font-family: Avenir Next, Poppins, apple-system, BlinkMacSystemFont,
      Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,
      Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,
      Segoe UI Symbol, Noto Color Emoji;
    --affine-font-number-family: Roboto Mono, apple-system, BlinkMacSystemFont,
      Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,
      Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,
      Segoe UI Symbol, Noto Color Emoji;
    --affine-font-code-family: Space Mono, Consolas, Menlo, Monaco, Courier,
      monospace, apple-system, BlinkMacSystemFont, Helvetica Neue, Tahoma,
      PingFang SC, Microsoft Yahei, Arial, Hiragino Sans GB, sans-serif,
      Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
    --affine-font-h-1: 28px;
    --affine-font-h-2: 26px;
    --affine-font-h-3: 24px;
    --affine-font-h-4: 22px;
    --affine-font-h-5: 20px;
    --affine-font-h-6: 18px;
    --affine-font-base: 16px;
    --affine-font-sm: 14px;
    --affine-font-xs: 12px;
    --affine-line-height: calc(1em + 8px);
    --affine-z-index-modal: 1000;
    --affine-z-index-popover: 1000;
    --affine-paragraph-space: 8px;
    --affine-popover-radius: 10px;
    --affine-zoom: 1;
    --affine-scale: calc(1 / var(--affine-zoom));

    --affine-brand-color: #5438ff;
    --affine-tertiary-color: #f3f0ff;
    --affine-primary-color: #5438ff;
    --affine-secondary-color: #7d91ff;
    --affine-background-success-color: #fff;
    --affine-background-error-color: hsla(0, 0%, 100%, 0.2);
    --affine-background-processing-color: #fff;
    --affine-background-warning-color: #fff;
    --affine-background-primary-color: #fff;
    --affine-background-overlay-panel-color: #fbfbfc;
    --affine-background-secondary-color: #fbfafc;
    --affine-background-tertiary-color: #e9e9ec;
    --affine-background-code-block: #fafbfd;
    --affine-background-modal-color: rgba(0, 0, 0, 0.6);
    --affine-text-primary-color: #424149;
    --affine-text-secondary-color: #8e8d91;
    --affine-text-disable-color: #a9a9ad;
    --affine-text-emphasis-color: #5438ff;
    --affine-hover-color: rgba(0, 0, 0, 0.04);
    --affine-link-color: #7d91ff;
    --affine-quote-color: #645f82;
    --affine-icon-color: #77757d;
    --affine-icon-secondary: hsla(255, 3%, 47%, 0.6);
    --affine-border-color: #e3e2e4;
    --affine-divider-color: #e3e2e4;
    --affine-placeholder-color: #c0bfc1;
    --affine-edgeless-grid-color: #e6e6e6;
    --affine-success-color: #10cb86;
    --affine-warning-color: #ff631f;
    --affine-error-color: #eb4335;
    --affine-processing-color: #2776ff;
    --affine-black-10: rgba(0, 0, 0, 0.1);
    --affine-black-30: rgba(0, 0, 0, 0.3);
    --affine-black-50: rgba(0, 0, 0, 0.5);
    --affine-black-60: rgba(0, 0, 0, 0.6);
    --affine-black-80: rgba(0, 0, 0, 0.8);
    --affine-black-90: rgba(0, 0, 0, 0.9);
    --affine-black: #000;
    --affine-white-10: hsla(0, 0%, 100%, 0.1);
    --affine-white-30: hsla(0, 0%, 100%, 0.3);
    --affine-white-50: hsla(0, 0%, 100%, 0.5);
    --affine-white-60: hsla(0, 0%, 100%, 0.6);
    --affine-white-80: hsla(0, 0%, 100%, 0.8);
    --affine-white-90: hsla(0, 0%, 100%, 0.9);
    --affine-white: #fff;
    --affine-tag-white: #f5f5f5;
    --affine-tag-gray: #e3e2e0;
    --affine-tag-red: #ffe1e1;
    --affine-tag-orange: #ffeaca;
    --affine-tag-yellow: #fff4d8;
    --affine-tag-green: #dff4e8;
    --affine-tag-teal: #dff4f3;
    --affine-tag-blue: #e1efff;
    --affine-tag-purple: #f3f0ff;
    --affine-tag-pink: #fce8ff;
    --affine-palette-line-yellow: #3874ff;
    --affine-palette-line-orange: #ffaf38;
    --affine-palette-line-tangerine: #ff631f;
    --affine-palette-line-red: #fc3f55;
    --affine-palette-line-magenta: #ff38b3;
    --affine-palette-line-purple: #b638ff;
    --affine-palette-line-navy: #3b25cc;
    --affine-palette-line-blue: #4f90ff;
    --affine-palette-line-green: #10cb86;
    --affine-palette-line-white: #fff;
    --affine-palette-line-black: #000;
    --affine-palette-line-grey: #999;
    --affine-palette-shape-yellow: #fff188;
    --affine-palette-shape-orange: #ffcf88;
    --affine-palette-shape-tangerine: #ffa179;
    --affine-palette-shape-red: #fd8c99;
    --affine-palette-shape-magenta: #ff88d1;
    --affine-palette-shape-purple: #d388ff;
    --affine-palette-shape-navy: #897ce0;
    --affine-palette-shape-blue: #95bcff;
    --affine-palette-shape-green: #70e0b6;
    --affine-palette-shape-white: #fff;
    --affine-palette-shape-black: #000;
    --affine-palette-shape-grey: #c2c2c2;
    --affine-tooltip: #424149;
  }
  body {
    font-family: var(--affine-font-family);
    color: var(--affine-text-primary-color);
  }
`,
        to = 'Untitled',
        tl = {
          exportFile(e, t) {
            let n = document.createElement('a');
            n.setAttribute('href', t);
            let r = (function (e) {
              (e = (function (e, t) {
                let n = t
                    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
                    .replace(/-/g, '\\x2d'),
                  r = RegExp(`(?:${n}){2,}`, 'g');
                return e.replace(r, t);
              })(
                (e = e
                  .normalize('NFD')
                  .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
                  .replace(/[\u0000-\u001F\u0080-\u009F]/g, ' ')
                  .replace(/\.+$/, '')),
                ' '
              )),
                (e = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(e) ? e + ' ' : e);
              let t = e.lastIndexOf('.'),
                n = e.slice(0, t).trim(),
                r = e.slice(t);
              return (e = n.slice(0, Math.max(1, 50 - r.length)) + r);
            })(e);
            n.setAttribute('download', r),
              (n.style.display = 'none'),
              document.body.appendChild(n),
              n.click(),
              document.body.removeChild(n);
          },
          exportTextFile(e, t, n) {
            tl.exportFile(
              e,
              'data:' + n + ';charset=utf-8,' + encodeURIComponent(t)
            );
          },
          exportHtml(e, t) {
            let n = e?.trim() || to;
            tl.exportTextFile(
              n + '.html',
              (function (e, t) {
                let n = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css">
<style>
  ${ti}
</style>`;
                return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${e}</title>
  ${n}
</head>
<body>
<div style="margin:0 auto;padding:1rem;max-width:${eG.Y9}px">
${t}
</div>
</body>
</html>
`;
              })(n, t),
              'text/html'
            );
          },
          exportHtmlAsMarkdown(e, t) {
            let n = new te();
            n.addRule('input', {
              [Symbol.iterator]() {},
              anchor: e => '',
              big: () => '',
              blink: () => '',
              bold: () => '',
              charAt: e => '',
              charCodeAt: e => 0,
              codePointAt(e) {},
              concat: e => '',
              endsWith: (e, t) => !1,
              fixed: () => '',
              fontcolor: e => '',
              includes: (e, t) => !1,
              indexOf: (e, t) => 0,
              italics: () => '',
              lastIndexOf: (e, t) => 0,
              length: 0,
              link: e => '',
              repeat: e => '',
              slice: (e, t) => '',
              small: () => '',
              startsWith: (e, t) => !1,
              strike: () => '',
              sub: () => '',
              substr: (e, t) => '',
              substring: (e, t) => '',
              sup: () => '',
              toLocaleLowerCase: e => '',
              toLocaleUpperCase: e => '',
              toLowerCase: () => '',
              toString: () => '',
              toUpperCase: () => '',
              trim: () => '',
              valueOf: () => '',
              fontsize: e => '',
              localeCompare: (e, t, n) => 0,
              match(e) {},
              normalize: e => '',
              replace: (e, t) => '',
              search: e => 0,
              split: (e, t) => [],
              filter: ['input'],
              replacement: function (e, t) {
                return null === t.getAttribute('checked') ? '[ ] ' : '[x] ';
              },
            }),
              n.addRule('codeBlock', {
                filter: ['pre'],
                replacement: function (e, t) {
                  return (
                    '```' +
                    t.getAttribute('code-lang') +
                    '\n' +
                    t.textContent +
                    '```\n'
                  );
                },
              }),
              n.keep(['del', 'u']);
            let r = n.turndown(t),
              s = e?.trim() || to;
            tl.exportTextFile(s + '.md', r, 'text/plain');
          },
          exportPng(e, t) {
            let n = e?.trim() || to;
            tl.exportFile(n + '.png', t);
          },
        };
      var tc = n(59867),
        tu = n(13592);
      let th = [
        'DEL',
        'STRONG',
        'B',
        'EM',
        'I',
        'U',
        'S',
        'SPAN',
        'A',
        'INPUT',
        'MARK',
        'CODE',
        'LABEL',
        'BIG',
        'SMALL',
        'ABBR',
        'CITE',
        'BDI',
        'TIME',
      ];
      class tp {
        constructor(e, t, n, r, s) {
          (this._fetchFileHandler = async e => {
            let t;
            if (this._customFetchFileHandler) {
              let t = await this._customFetchFileHandler(e);
              if (t && t.size > 0) return t;
            }
            try {
              t = await fetch(e, {
                cache: 'no-cache',
                mode: 'cors',
                headers: { Origin: window.location.origin },
              });
            } catch (e) {
              return console.error(e), null;
            }
            let n = await t.blob();
            return n.type.startsWith('image/') ? n : null;
          }),
            (this._nodeParser = async e => {
              let t;
              if (
                (t = await this._contentParser.getParserHtmlText2Block(
                  'customNodeParser'
                )?.(e)) &&
                t.length > 0
              )
                return t;
              let n = e.tagName,
                r = e instanceof Text || th.includes(n);
              if (r && e.textContent?.length)
                t = await this._contentParser.getParserHtmlText2Block(
                  'commonParser'
                )?.({ element: e, flavour: 'affine:paragraph', type: 'text' });
              else
                switch (n) {
                  case 'H1':
                  case 'H2':
                  case 'H3':
                  case 'H4':
                  case 'H5':
                  case 'H6':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'commonParser'
                    )?.({
                      element: e,
                      flavour: 'affine:paragraph',
                      type: n.toLowerCase(),
                    });
                    break;
                  case 'BLOCKQUOTE':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'blockQuoteParser'
                    )?.(e);
                    break;
                  case 'P':
                    t =
                      e.firstChild instanceof Text &&
                      (e.firstChild.textContent?.startsWith('[] ') ||
                        e.firstChild.textContent?.startsWith('[ ] ') ||
                        e.firstChild.textContent?.startsWith('[x] '))
                        ? await this._contentParser.getParserHtmlText2Block(
                            'listItemParser'
                          )?.(e)
                        : e.firstChild instanceof HTMLImageElement
                        ? await this._contentParser.getParserHtmlText2Block(
                            'embedItemParser'
                          )?.(e.firstChild)
                        : e.firstElementChild?.tagName === 'A' ||
                          e.firstElementChild
                            ?.getAttribute('href')
                            ?.endsWith('.csv')
                        ? await this._contentParser.getParserHtmlText2Block(
                            'tableParser'
                          )?.(e.firstChild)
                        : await this._contentParser.getParserHtmlText2Block(
                            'commonParser'
                          )?.({
                            element: e,
                            flavour: 'affine:paragraph',
                            type: 'text',
                          });
                    break;
                  case 'LI':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'listItemParser'
                    )?.(e);
                    break;
                  case 'HR':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'commonParser'
                    )?.({ element: e, flavour: 'affine:divider' });
                    break;
                  case 'PRE':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'codeBlockParser'
                    )?.(e);
                    break;
                  case 'FIGURE':
                  case 'IMG':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'embedItemParser'
                    )?.(e);
                    break;
                  case 'HEADER':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'headerParser'
                    )?.(e);
                    break;
                  case 'TABLE':
                    t = await this._contentParser.getParserHtmlText2Block(
                      'tableParser'
                    )?.(e);
                }
              if (t && t.length > 0) return t;
              if (e.childNodes.length > 0) {
                let t = Array.from(e.childNodes).some(e => {
                  if (e.nodeType === Node.TEXT_NODE) return !1;
                  if (e.nodeType === Node.ELEMENT_NODE) {
                    let t =
                      th.includes(e.tagName) ||
                      (e.tagName.includes('-') && tg(e));
                    return !t;
                  }
                  return !0;
                });
                if (!t) {
                  let t = await this._commonHTML2Block(
                    e,
                    'affine:paragraph',
                    'text'
                  );
                  if (t) return [t];
                }
              }
              let s = Array.from(e.children).map(async e => {
                  let t =
                    (await this._contentParser.getParserHtmlText2Block(
                      'nodeParser'
                    )?.(e)) || [];
                  return t;
                }),
                a = [];
              for (let e of s) a.push(await e);
              return a.flat().filter(e => e);
            }),
            (this._commonParser = async ({
              element: e,
              flavour: t,
              type: n,
              checked: r,
              ignoreEmptyElement: s = !0,
            }) => {
              let a = await this._commonHTML2Block(e, t, n, r, s);
              return a ? [a] : null;
            }),
            (this._listItemParser = async e => {
              let t, n;
              let r = e.parentElement?.tagName,
                s = 'OL' === r ? 'numbered' : 'bulleted';
              if (
                e.firstElementChild?.tagName === 'DETAIL' ||
                e.firstElementChild?.firstElementChild?.tagName === 'SUMMARY'
              ) {
                let t = await this._contentParser.getParserHtmlText2Block(
                    'commonParser'
                  )?.({
                    element: e.firstElementChild.firstElementChild,
                    flavour: 'affine:list',
                    type: s,
                  }),
                  n = e.firstElementChild.childNodes,
                  r = [];
                for (let e = 1; e < n.length; e++) {
                  let t = n.item(e);
                  if (t && t instanceof Element) {
                    let e = await this._nodeParser(t);
                    e && r.push(...e);
                  }
                }
                return (
                  t &&
                    t.length > 0 &&
                    (t[0].children = [...(t[0].children || []), ...r]),
                  t
                );
              }
              return (
                ((n = e.firstElementChild)?.tagName === 'INPUT' ||
                  (n = e.firstElementChild?.firstElementChild)?.tagName ===
                    'INPUT') &&
                  ((s = 'todo'), (t = null !== n?.getAttribute('checked'))),
                e.firstChild instanceof Text &&
                  (e.firstChild.textContent?.startsWith('[] ')
                    ? ((e.firstChild.textContent =
                        e.firstChild.textContent.slice(3)),
                      (s = 'todo'),
                      (t = !1))
                    : e.firstChild.textContent?.startsWith('[ ] ')
                    ? ((e.firstChild.textContent =
                        e.firstChild.textContent.slice(4)),
                      (s = 'todo'),
                      (t = !1))
                    : e.firstChild.textContent?.startsWith('[x] ') &&
                      ((e.firstChild.textContent =
                        e.firstChild.textContent.slice(4)),
                      (s = 'todo'),
                      (t = !0))),
                this._contentParser.getParserHtmlText2Block('commonParser')?.({
                  element: e,
                  flavour: 'affine:list',
                  type: s,
                  checked: t,
                })
              );
            }),
            (this._blockQuoteParser = async e => {
              let t = e => {
                  let n = [];
                  return (
                    e.forEach(e => {
                      let r = e.text?.filter(e => e.insert) || [];
                      n.length > 0 && r.length > 0 && n.push({ insert: '\n' }),
                        n.push(...r);
                      let s = t(e.children || []) || [];
                      n.length > 0 && s.length > 0 && n.push({ insert: '\n' }),
                        n.push(...s);
                    }),
                    n
                  );
                },
                n = await this._contentParser.getParserHtmlText2Block(
                  'commonParser'
                )?.({ element: e, flavour: 'affine:paragraph', type: 'text' });
              return n
                ? [
                    {
                      flavour: 'affine:paragraph',
                      type: 'quote',
                      text: t(n),
                      children: [],
                    },
                  ]
                : null;
            }),
            (this._codeBlockParser = async e => {
              let t = e.children[0],
                n = t?.getAttribute('class')?.split('-'),
                r = 'Code' === t.tagName && n?.[0] === 'language',
                s = '',
                a = tu.AY;
              return (
                r
                  ? ((s = e.firstChild?.textContent || ''),
                    (a = tc.W(n?.[1])?.id || tu.AY))
                  : (s = e.textContent || ''),
                [
                  {
                    flavour: 'affine:code',
                    text: [{ insert: s }],
                    children: [],
                    language: a,
                  },
                ]
              );
            }),
            (this._embedItemParser = async e => {
              let t = [],
                n = null,
                r = [];
              if ('FIGURE' === e.tagName) {
                n = e.querySelector('img');
                let t = e.querySelector('figcaption');
                if (t) {
                  let e = await this._contentParser.getParserHtmlText2Block(
                    'commonParser'
                  )?.({
                    element: t,
                    flavour: 'affine:paragraph',
                    type: 'text',
                  });
                  e && e.length > 0 && r.push(...(e[0].text || []));
                }
              } else
                e instanceof HTMLImageElement &&
                  ((n = e), r.push({ insert: '' }));
              if (n) {
                let e = n.getAttribute('src') || '',
                  s = await this._fetchFileHandler(e);
                if (s && 0 !== s.size) {
                  let e = this._page.blobs;
                  (0, a.kP)(e);
                  let n = await e.set(s);
                  t = [
                    {
                      flavour: 'affine:embed',
                      type: 'image',
                      sourceId: n,
                      children: [],
                      text: r,
                    },
                  ];
                } else
                  t = [
                    {
                      flavour: 'affine:paragraph',
                      type: 'text',
                      children: [],
                      text: [{ insert: e, attributes: { link: e } }],
                    },
                  ];
              }
              return t;
            }),
            (this._tableParser = async e => {
              let t = [];
              if (
                this._customTableParserHandler &&
                (t = await this._customTableParserHandler(e)) &&
                t.length > 0
              )
                return t;
              if ('TABLE' === e.tagName) {
                let n = e.querySelector('thead'),
                  r = e.querySelector('tbody'),
                  s = n?.querySelector('tr'),
                  a = 1,
                  i = [];
                s?.querySelectorAll('th').forEach(e => {
                  i.push(e.textContent || '');
                });
                let o = [];
                r?.querySelectorAll('tr').forEach(e => {
                  let t = [];
                  e.querySelectorAll('td').forEach(e => {
                    t.push(e.textContent || '');
                  }),
                    o.push(t);
                });
                let l = i
                  .slice(1)
                  .map((e, t) => ({
                    name: e,
                    type: 'rich-text',
                    width: 200,
                    hide: !1,
                    id: '' + a++,
                  }));
                if (o.length > 0) {
                  let e = o[0].length;
                  for (let t = 1; t < o.length; t++)
                    e = Math.max(e, o[t].length);
                  let t = e - l.length;
                  for (let e = 0; e < t; e++)
                    l.push({
                      name: '',
                      type: 'rich-text',
                      width: 200,
                      hide: !1,
                      id: '' + a++,
                    });
                }
                let c = a++,
                  u = {},
                  h = [];
                o.forEach(e => {
                  h.push({
                    flavour: 'affine:paragraph',
                    type: 'text',
                    text: [{ insert: e[0] }],
                    children: [],
                  });
                  let t = '' + a++;
                  (u[t] = {}),
                    e.slice(1).forEach((e, n) => {
                      u[t][l[n].id] = { columnId: l[n].id, value: e };
                    });
                }),
                  (t = [
                    {
                      flavour: 'affine:database',
                      databaseProps: {
                        id: '' + c,
                        title: 'Database',
                        titleColumnName: i[0],
                        titleColumnWidth: 432,
                        rowIds: Object.keys(u),
                        cells: u,
                        columns: l,
                      },
                      children: h,
                    },
                  ]);
              }
              return t;
            }),
            (this._headerParser = async e => {
              let t = e;
              e.getElementsByClassName('page-title').length > 0 &&
                (t = e.getElementsByClassName('page-title')[0]);
              let n = t.tagName,
                r = await this._contentParser.getParserHtmlText2Block(
                  'commonParser'
                )?.({
                  element: t,
                  flavour: 'affine:page',
                  type: n.toLowerCase(),
                });
              return r;
            }),
            (this._contentParser = e),
            (this._page = t),
            (this._customFetchFileHandler = n),
            (this._customTextStyleHandler = r),
            (this._customTableParserHandler = s);
        }
        registerParsers() {
          this._contentParser.registerParserHtmlText2Block(
            'nodeParser',
            this._nodeParser
          ),
            this._contentParser.registerParserHtmlText2Block(
              'commonParser',
              this._commonParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'listItemParser',
              this._listItemParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'blockQuoteParser',
              this._blockQuoteParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'codeBlockParser',
              this._codeBlockParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'embedItemParser',
              this._embedItemParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'tableParser',
              this._tableParser
            ),
            this._contentParser.registerParserHtmlText2Block(
              'headerParser',
              this._headerParser
            );
        }
        async _commonHTML2Block(e, t, n, r, s = !0) {
          let a = e.childNodes,
            i = !1,
            o = [],
            l = [];
          for (let e = 0; e < a.length; e++) {
            let t = a.item(e);
            if (t && '#comment' !== t.nodeName && 'STYLE' !== t.nodeName) {
              if (
                !i &&
                (t instanceof Text ||
                  th.includes(t.tagName) ||
                  (t.tagName.includes('-') && tg(t)))
              ) {
                o.push(...this._commonHTML2Text(t, {}, s));
                continue;
              }
              if (t instanceof Element) {
                let e = await this._nodeParser(t);
                e && l.push(...e);
              }
              i = !0;
            }
          }
          return 0 === o.length && 1 === l.length
            ? {
                flavour: t,
                type: n,
                checked: r,
                text: l[0].text,
                children: l[0].children,
              }
            : 0 === o.length && l.length > 0 && 'affine:list' === t
            ? {
                flavour: t,
                type: n,
                checked: r,
                text: l[0].text,
                children: l.slice(1),
              }
            : { flavour: t, type: n, checked: r, text: o, children: l };
        }
        _commonHTML2Text(e, t = {}, n = !0) {
          if (e instanceof Text) {
            let n = !1;
            return (
              t.reference && (n = 'LinkedPage' === t.reference.type),
              (e.textContent || '')
                .split('\n')
                .map(e => ({ insert: n ? ' ' : e, attributes: t }))
            );
          }
          if (e.classList.contains('katex-mathml')) return [];
          let r = Array.from(e.childNodes),
            s = tf(e);
          return (this._customTextStyleHandler &&
            this._customTextStyleHandler(e, s),
          r.length)
            ? r
                .reduce((e, r) => {
                  let a = this._commonHTML2Text(r, { ...t, ...s }, n);
                  return e.push(...a), e;
                }, [])
                .filter(e => e)
            : n
            ? []
            : [{ insert: '', attributes: s }];
        }
      }
      let td = e => ['A'].includes(e.tagName),
        tf = e => {
          let t = e.tagName,
            n = {},
            r = (e.getAttribute('style') || '').split(';').reduce((e, t) => {
              let [n, r] = t.split(':');
              return n && r && (e[n] = r), e;
            }, {});
          if (
            (('bold' === r['font-weight'] ||
              Number(r['font-weight']) > 400 ||
              ['STRONG', 'B', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(
                e.tagName
              )) &&
              (n.bold = !0),
            td(e))
          ) {
            let t = e.getAttribute('href') || e.getAttribute('src');
            n.link = t;
          }
          return (
            ('EM' === t || 'italic' === r.fontStyle) && (n.italic = !0),
            ('U' === t ||
              (r['text-decoration'] &&
                -1 !== r['text-decoration'].indexOf('underline')) ||
              r['border-bottom']) &&
              (n.underline = !0),
            'CODE' === t && (n.code = !0),
            ('S' === t ||
              'DEL' === t ||
              (r['text-decoration'] &&
                -1 !== r['text-decoration'].indexOf('line-through'))) &&
              (n.strike = !0),
            'MARK' === t && (n.background = 'yellow'),
            n
          );
        },
        tg = e => {
          let t = window.getComputedStyle(e);
          return (
            t.display.includes('inline') || e.style.display.includes('inline')
          );
        };
      class tm {
        constructor(e, t, n, r) {
          (this.slots = { beforeHtml2Block: new i.g7() }),
            (this._parsers = {}),
            (this.urlPattern =
              /(?<=\s|^)https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)(?=\s|$)/g),
            (this._page = e),
            (this._htmlParser = new tp(this, e, t, n, r)),
            this._htmlParser.registerParsers();
        }
        async exportHtml() {
          let e = this._page.root;
          if (!e) return;
          let t = await this.block2Html(
            this._getSelectedBlock(e).children[1].children
          );
          tl.exportHtml(e.title.toString(), t);
        }
        async exportMarkdown() {
          let e = this._page.root;
          if (!e) return;
          let t = await this.block2Html(
            this._getSelectedBlock(e).children[1].children
          );
          tl.exportHtmlAsMarkdown(e.title.toString(), t);
        }
        async exportPng() {
          let e = this._page.root;
          if (!e) return;
          let t = (0, eF.VA)(this._page),
            n = document.createElement('style');
          (n.textContent =
            'editor-container,.affine-editor-container {height: auto;}'),
            t.appendChild(n),
            tl.exportPng(e.title.toString(), await ee(t, { cacheBust: !0 })),
            t.removeChild(n);
        }
        async exportPdf() {
          let e = this._page.root;
          e && window.print();
        }
        async block2Html(e) {
          let t = '';
          for (let n = 0; n < e.length; n++)
            t += await this._getHtmlInfoBySelectionInfo(e[n]);
          return t;
        }
        async block2Text(e) {
          return (
            await Promise.all(e.map(e => this._getTextInfoBySelectionInfo(e)))
          ).reduce((e, t) => e + t, '');
        }
        async htmlText2Block(e) {
          let t = document.createElement('html');
          return (
            (t.innerHTML = e),
            t.querySelector('head')?.remove(),
            this.slots.beforeHtml2Block.emit(t),
            this._convertHtml2Blocks(t)
          );
        }
        async file2Blocks(e) {
          let t = (0, eD.Oj)(e);
          if (t && t.type.includes('image')) {
            let e = this._page.blobs;
            (0, a.kP)(e);
            let n = await e.set(t);
            return [
              {
                flavour: 'affine:embed',
                type: 'image',
                sourceId: n,
                children: [],
              },
            ];
          }
          return [];
        }
        async markdown2Block(e) {
          eM.use({
            extensions: [
              {
                name: 'underline',
                level: 'inline',
                start: e => e.indexOf('~'),
                tokenizer(e) {
                  let t = /^~([^~]+)~/.exec(e);
                  if (t)
                    return { type: 'underline', raw: t[0], text: t[1].trim() };
                },
                renderer: e => `<u>${e.text}</u>`,
              },
              {
                name: 'inlineCode',
                level: 'inline',
                start: e => e.indexOf('`'),
                tokenizer(e) {
                  let t = /^(?:`)(`{2,}?|[^`]+)(?:`)$/g.exec(e);
                  if (t)
                    return { type: 'inlineCode', raw: t[0], text: t[1].trim() };
                },
                renderer: e => `<code>${e.text}</code>`,
              },
            ],
          });
          let t = eM.parse(e);
          return this.htmlText2Block(t);
        }
        async importMarkdown(e, t) {
          let r = await this.markdown2Block(e),
            s = this._page.getBlockById(t);
          (0, a.kP)(s);
          let { getServiceOrRegister: i } = await n.e(280).then(n.bind(n, 280)),
            o = await i(s.flavour);
          o.json2Block(s, r);
        }
        async importHtml(e, t) {
          let r = await this.htmlText2Block(e),
            s = this._page.getBlockById(t);
          (0, a.kP)(s);
          let { getServiceOrRegister: i } = await n.e(280).then(n.bind(n, 280)),
            o = await i(s.flavour);
          o.json2Block(s, r);
        }
        registerParserHtmlText2Block(e, t) {
          this._parsers[e] = t;
        }
        getParserHtmlText2Block(e) {
          return this._parsers[e] || null;
        }
        text2blocks(e) {
          return e.split('\n').map(e => {
            let t = e.split(this.urlPattern),
              n = e.match(this.urlPattern),
              r = [];
            for (let e = 0; e < t.length; e++)
              t[e] && r.push({ insert: t[e] }),
                n &&
                  n[e] &&
                  r.push({ insert: n[e], attributes: { link: n[e] } });
            return {
              flavour: 'affine:paragraph',
              type: 'text',
              text: r,
              children: [],
            };
          });
        }
        _getSelectedBlock(e) {
          return {
            id: e.id,
            children: e.children.map(e => this._getSelectedBlock(e)),
          };
        }
        async _getHtmlInfoBySelectionInfo(e) {
          let t = this._page.getBlockById(e.id);
          if (!t) return '';
          let r = [];
          for (let t = 0; t < e.children.length; t++) {
            let n = await this._getHtmlInfoBySelectionInfo(e.children[t]);
            n && r.push(n);
          }
          let { getServiceOrRegister: s } = await n.e(280).then(n.bind(n, 280)),
            a = await s(t.flavour);
          return a.block2html(t, {
            childText: r.join(''),
            begin: e.startPos,
            end: e.endPos,
          });
        }
        async _getTextInfoBySelectionInfo(e) {
          let t = this._page.getBlockById(e.id);
          if (!t) return '';
          let r = [];
          for (let t of e.children) {
            let e = await this._getTextInfoBySelectionInfo(t);
            e && r.push(e);
          }
          let { getServiceOrRegister: s } = await n.e(280).then(n.bind(n, 280)),
            a = await s(t.flavour);
          return a.block2Text(t, {
            childText: r.join(''),
            begin: e.startPos,
            end: e.endPos,
          });
        }
        async _convertHtml2Blocks(e) {
          let t = Array.from(e.children).map(
              async e =>
                (await this.getParserHtmlText2Block('nodeParser')?.(e)) || []
            ),
            n = [];
          for (let e of t) n.push(await e);
          return n.flat().filter(e => e);
        }
      }
    },
    59867: function (e, t, n) {
      'use strict';
      n.d(t, {
        A: function () {
          return a;
        },
        W: function () {
          return i;
        },
      });
      var r = n(464),
        s = n(13592);
      let a = [
          'python',
          'c',
          'java',
          'cpp',
          'csharp',
          'vb',
          'javascript',
          'php',
          'sql',
          'asm',
          'pascal',
          'go',
          'swift',
          'matlab',
          'r',
          'rust',
          'ruby',
          'sas',
          'ada',
          'perl',
          'objective-c',
          'cobol',
          'lisp',
          'dart',
          'lua',
          'julia',
          'd',
          'kotlin',
          'logo',
          'scala',
          'haskell',
          'fsharp',
          'scheme',
          'typescript',
          'groovy',
          'abap',
          'prolog',
          'plsql',
          'bash',
          'apex',
          'markdown',
          'json',
          'html',
          'css',
          'diff',
          'jsx',
          'tsx',
          'vue',
        ].reduce((e, t, n) => ({ [t]: n, ...e }), {}),
        i = e => {
          if (!e || [s.NL.id, ...s.NL.aliases].includes(e.toLowerCase()))
            return null;
          let t = r.tc.find(
            t =>
              t.id.toLowerCase() === e.toLowerCase() ||
              t.aliases?.includes(e.toLowerCase())
          );
          return t ?? null;
        };
    },
  },
]);
//# sourceMappingURL=4057-483e4473d607e0a9.js.map
