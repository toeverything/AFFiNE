import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { lezer } from '@codemirror/lang-lezer';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { MySQL, PostgreSQL, sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { StreamLanguage } from '@codemirror/language';
import { brainfuck } from '@codemirror/legacy-modes/mode/brainfuck';
import { clojure } from '@codemirror/legacy-modes/mode/clojure';
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { go } from '@codemirror/legacy-modes/mode/go';
import { julia } from '@codemirror/legacy-modes/mode/julia';
import { liveScript } from '@codemirror/legacy-modes/mode/livescript';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { pascal } from '@codemirror/legacy-modes/mode/pascal';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { r } from '@codemirror/legacy-modes/mode/r';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { scheme } from '@codemirror/legacy-modes/mode/scheme';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { stylus } from '@codemirror/legacy-modes/mode/stylus';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { tcl } from '@codemirror/legacy-modes/mode/tcl';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import { vbScript } from '@codemirror/legacy-modes/mode/vbscript';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { Extension } from '@codemirror/state';
import {
    BlockPendantProvider,
    useOnSelectActive,
} from '@toeverything/components/editor-core';
import { DuplicateIcon } from '@toeverything/components/icons';
import { Option, Select, styled } from '@toeverything/components/ui';
import { CreateView } from '@toeverything/framework/virgo';
import { copyToClipboard } from '@toeverything/utils';

import { elixir } from 'codemirror-lang-elixir';
import { useEffect, useRef, useState } from 'react';
import { StyleWithAtRules } from 'style9';

import CodeMirror, { ReactCodeMirrorRef } from './CodeMirror';

interface CreateCodeView extends CreateView {
    style9?: StyleWithAtRules;
    containerClassName?: string;
}
const langs: Record<string, any> = {
    javascript,
    jsx: () => javascript({ jsx: true }),
    typescript: () => javascript({ typescript: true }),
    tsx: () => javascript({ jsx: true, typescript: true }),
    json,
    html,
    css,
    python,
    markdown,
    xml,
    sql,
    mysql: () => sql({ dialect: MySQL }),
    pgsql: () => sql({ dialect: PostgreSQL }),
    java,
    rust,
    cpp,
    lezer,
    php,
    go: () => StreamLanguage.define(go),
    shell: () => StreamLanguage.define(shell),
    lua: () => StreamLanguage.define(lua),
    swift: () => StreamLanguage.define(swift),
    tcl: () => StreamLanguage.define(tcl),
    yaml: () => StreamLanguage.define(yaml),
    vb: () => StreamLanguage.define(vb),
    powershell: () => StreamLanguage.define(powerShell),
    brainfuck: () => StreamLanguage.define(brainfuck),
    stylus: () => StreamLanguage.define(stylus),
    erlang: () => StreamLanguage.define(erlang),
    elixir: () => StreamLanguage.define(elixir),
    nginx: () => StreamLanguage.define(nginx),
    perl: () => StreamLanguage.define(perl),
    ruby: () => StreamLanguage.define(ruby),
    pascal: () => StreamLanguage.define(pascal),
    livescript: () => StreamLanguage.define(liveScript),
    scheme: () => StreamLanguage.define(scheme),
    toml: () => StreamLanguage.define(toml),
    vbscript: () => StreamLanguage.define(vbScript),
    clojure: () => StreamLanguage.define(clojure),
    coffeescript: () => StreamLanguage.define(coffeeScript),
    julia: () => StreamLanguage.define(julia),
    dockerfile: () => StreamLanguage.define(dockerFile),
    r: () => StreamLanguage.define(r),
};
const DEFAULT_LANG = 'markdown';
const CodeBlock = styled('div')(({ theme }) => ({
    backgroundColor: '#F2F5F9',
    padding: '8px 24px',
    borderRadius: theme.affine.shape.borderRadius,
    '&:hover': {
        '.operation': {
            opacity: 1,
        },
    },
    '.operation': {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        opacity: 0,
        transition: 'opacity 1.5s',
    },
    '.copy-block': {
        padding: '0px 10px',
        backgroundColor: '#fff',
        height: '32px',
        display: 'flex',
        width: '90px',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#4C6275',
        fontSize: '14px',
        borderRadius: theme.affine.shape.borderRadius,
        cursor: 'pointer',
        svg: {
            marginRight: '4px',
            display: 'block',
        },
    },
    '.cm-focused': {
        outline: 'none !important',
    },
}));
export const CodeView = ({ block, editor }: CreateCodeView) => {
    const initValue: string = block.getProperty('text')?.value?.[0]?.text;
    const langType: string = block.getProperty('lang');
    const [extensions, setExtensions] = useState<Extension[]>();
    const codeMirror = useRef<ReactCodeMirrorRef>();
    const focusCode = () => {
        if (codeMirror.current) {
            codeMirror?.current?.view?.focus();
        }
    };
    //TODO listen codeMirror.up down event , active
    useOnSelectActive(block.id, () => {
        focusCode();
    });
    const onChange = (value: string) => {
        block.setProperty('text', {
            value: [{ text: value }],
        });
    };
    const handleLangChange = (lang: string) => {
        block.setProperty('lang', lang);
        setExtensions([langs[lang]()]);
    };
    useEffect(() => {
        handleLangChange(langType ? langType : DEFAULT_LANG);
    }, []);

    const copyCode = () => {
        copyToClipboard(initValue);
    };
    const handleKeyArrowDown = () => {
        editor.selectionManager.activeNextNode(block.id, 'start');
    };
    const handleKeyArrowUp = () => {
        editor.selectionManager.activePreviousNode(block.id, 'start');
    };
    return (
        <BlockPendantProvider editor={editor} block={block}>
            <CodeBlock
                onKeyDown={e => {
                    e.stopPropagation();
                }}
            >
                <div className="operation">
                    <div className="select">
                        <Select
                            width={128}
                            placeholder="Search for a field type"
                            value={langType || DEFAULT_LANG}
                            listboxStyle={{ maxHeight: '400px' }}
                            onChange={(selectedValue: string) => {
                                handleLangChange(selectedValue);
                            }}
                        >
                            {Object.keys(langs).map(item => {
                                return (
                                    <Option key={item} value={item}>
                                        {item}
                                    </Option>
                                );
                            })}
                        </Select>
                    </div>
                    <div>
                        <div className="copy-block" onClick={copyCode}>
                            <DuplicateIcon />
                            Copy
                        </div>
                    </div>
                </div>

                <CodeMirror
                    ref={codeMirror}
                    value={initValue}
                    height={'auto'}
                    extensions={extensions}
                    onChange={onChange}
                    handleKeyArrowDown={handleKeyArrowDown}
                    handleKeyArrowUp={handleKeyArrowUp}
                />
            </CodeBlock>
        </BlockPendantProvider>
    );
};
