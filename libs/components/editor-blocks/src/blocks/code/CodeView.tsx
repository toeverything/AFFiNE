import { useState, useRef, useEffect } from 'react';
import { StyleWithAtRules } from 'style9';

import { CreateView } from '@toeverything/framework/virgo';
import CodeMirror, { ReactCodeMirrorRef } from './CodeMirror';
import { styled } from '@toeverything/components/ui';

import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { sql, MySQL, PostgreSQL } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { lezer } from '@codemirror/lang-lezer';
import { php } from '@codemirror/lang-php';
import { StreamLanguage } from '@codemirror/language';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { tcl } from '@codemirror/legacy-modes/mode/tcl';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { brainfuck } from '@codemirror/legacy-modes/mode/brainfuck';
import { stylus } from '@codemirror/legacy-modes/mode/stylus';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { elixir } from 'codemirror-lang-elixir';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { pascal } from '@codemirror/legacy-modes/mode/pascal';
import { liveScript } from '@codemirror/legacy-modes/mode/livescript';
import { scheme } from '@codemirror/legacy-modes/mode/scheme';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { vbScript } from '@codemirror/legacy-modes/mode/vbscript';
import { clojure } from '@codemirror/legacy-modes/mode/clojure';
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { julia } from '@codemirror/legacy-modes/mode/julia';
import { r } from '@codemirror/legacy-modes/mode/r';
import { Extension } from '@codemirror/state';
import { Option, Select } from '@toeverything/components/ui';

import {
    useOnSelect,
    BlockPendantProvider,
} from '@toeverything/components/editor-core';
import { copyToClipboard } from '@toeverything/utils';
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
const DEFAULT_LANG = 'javascript';
const CodeBlock = styled('div')(({ theme }) => ({
    backgroundColor: '#F2F5F9',
    padding: '8px 24px',
    borderRadius: theme.affine.shape.borderRadius,
    '&:hover': {
        '.operation': {
            display: 'flex',
        },
    },
    '.operation': {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    '.copy-block': {
        padding: '6px 10px',
        backgroundColor: '#fff',
        borderRadius: theme.affine.shape.borderRadius,
        cursor: 'pointer',
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
    useOnSelect(block.id, (_is_select: boolean) => {
        if (codeMirror.current) {
            codeMirror?.current?.view?.focus();
        }
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
        <BlockPendantProvider block={block}>
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
