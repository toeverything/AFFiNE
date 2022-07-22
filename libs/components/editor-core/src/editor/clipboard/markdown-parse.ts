import { isFunction, isString } from '@toeverything/utils';

class MarkdownParser {
    private code_blocks: any[];
    private html_blocks: any[];
    private html_spans: any[];
    private gTitles: any;
    private gUrls: any;
    private list_level: number;
    private convert_flag: boolean;
    private static regexes: any = {
        asteriskDashTildeAndColon: /([*_:~])/g,
        asteriskDashAndTilde: /([*_~])/g,
        simpleURLRegex:
            /([*~_]+|\b)(((https?|ftp|dict):\/\/|www\.)[^'">\s]+?\.[^'">\s]+?)()(\1)?(?=\s|$)(?!["<>])/gi,
        simpleURLRegex2:
            // eslint-disable-next-line
            /([*~_]+|\b)(((https?|ftp|dict):\/\/|www\.)[^'">\s]+\.[^'">\s]+?)([.!?,()\[\]])?(\1)?(?=\s|$)(?!["<>])/gi,
        delimUrlRegex: /()<(((https?|ftp|dict):\/\/|www\.)[^'">\s]+)()>()/gi,
        simpleMailRegex:
            /(^|\s)(?:mailto:)?([A-Za-z0-9!#$%&'*+-/=?^_`{|}~.]+@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)(?=$|\s)/gim,
        delimMailRegex:
            /<()(?:mailto:)?([-.\w]+@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
    };

    constructor() {
        this.init_global_var();
    }

    private check_reg_arr: RegExp[] = [
        /^(#{1,6})[ \t]*(.+?)[ \t]*#*\n+/gm, // header
        /^ {0,3}\|?.+\|.+\n {0,3}\|?[ \t]*:?[ \t]*(?:[-=]){2,}[ \t]*:?[ \t]*\|[ \t]*:?[ \t]*(?:[-=]){2,}[\s\S]+?(?:\n\n|¨0)/gm, // table
        /(?:^|\n)(?: {0,3})(```+|~~~+)(?: *)([^\s`~]*)\n([\s\S]*?)\n(?: {0,3})\1/g, // codeBlock
        /(\n\n|^\n?)(( {0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(¨0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm, // list
        /!\[([^\]]*?)] ?(?:\n *)?\[([\s\S]*?)]()()()()()/g, // referenceImage
        /!\[([^\]]*?)][ \t]*()\([ \t]?<?([\S]+?(?:\([\S]*?\)[\S]*?)?)>?(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(["'])([^"]*?)\6)?[ \t]?\)/g, // inlineImage
        /!\[([^\]]*?)][ \t]*()\([ \t]?<([^>]*)>(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(?:(["'])([^"]*?)\6))?[ \t]?\)/g, // crazyImage
        /!\[([^\]]*?)][ \t]*()\([ \t]?<?(data:.+?\/.+?;base64,[A-Za-z0-9+/=\n]+?)>?(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(["'])([^"]*?)\6)?[ \t]?\)/g, // base64Image
        // eslint-disable-next-line
        /!\[([^\[\]]+)]()()()()()/g, // referShortcutImage
        // eslint-disable-next-line
        /\[((?:\[[^\]]*]|[^\[\]])*)]()[ \t]*\([ \t]?<?([\S]+?(?:\([\S]*?\)[\S]*?)?)>?(?:[ \t]*((["'])([^"]*?)\5))?[ \t]?\)/g, // Generallink
        // eslint-disable-next-line
        /\[((?:\[[^\]]*]|[^\[\]])*)] ?(?:\n *)?\[(.*?)]()()()()/g, // inlineLink
        // eslint-disable-next-line
        /\[((?:\[[^\]]*]|[^\[\]])*)]()[ \t]*\([ \t]?<([^>]*)>(?:[ \t]*((["'])([^"]*?)\5))?[ \t]?\)/g, // special link
        // eslint-disable-next-line
        /\[([^\[\]]+)]()()()()()/g, // abbreviationlink
    ];

    /** Extract some grammar rules to check whether a piece of text contains markdown grammar */
    checkIfTextContainsMd(text: any) {
        text = text.replace(/¨/g, '¨T');
        text = text.replace(/\$/g, '¨D'); // replace $ with ¨D
        // Standardize the line position (unify mac, dos)
        text = text.replace(/\r\n/g, '\n'); // dos
        text = text.replace(/\r/g, '\n'); // mac
        text = text.replace(/\u00A0/g, '&nbsp;'); // normalize spaces
        // 2. Due to the grammatical characteristics of markdwon (one \n is not counted as a newline, two are counted), let the start and end of the text be a pair of newlines, so as to ensure that the first and last lines of the pasted content can be recognized normally
        text = `\n\n${text}\n\n`; // 3. Convert tab to space
        text = this.detab(text); // 4. Delete lines consisting only of space and tab

        for (let i = 0; i < this.check_reg_arr.length; i++) {
            const text1 = i === 3 ? `${text}¨0` : text;

            if (this.check_reg_arr[i].test(text1)) {
                return true;
            }
        }

        return false;
    }

    private init_global_var() {
        this.code_blocks = [];
        this.html_blocks = [];
        this.html_spans = [];
        this.gTitles = [];
        this.gUrls = {};
        this.list_level = 0;
        this.convert_flag = false; // Whether md syntax is recognized
    }

    private replace_link() {
        return (
            wm: any,
            leadingMagicChars: any,
            link: any,
            m2: any,
            m3: any,
            trailingPunctuation: any,
            trailingMagicChars: any
        ) => {
            link = link.replace(
                MarkdownParser.regexes.asteriskDashTildeAndColon,
                this.escape_characters_callback
            );
            const lnkTxt = link,
                append = '',
                target = '',
                lmc = leadingMagicChars || '',
                tmc = trailingMagicChars || '';

            if (/^www\./i.test(link)) {
                link = link.replace(/^www\./i, 'http://www.');
            }

            return `${lmc}<a href="${link}"${target}>${lnkTxt}</a>${append}${tmc}`;
        };
    }

    private replace_mail() {
        return (wholeMatch: any, b: any, mail: any) => {
            let href = 'mailto:';
            b = b || '';
            mail = this.unescape_special_chars(mail);
            href = href + mail;
            return `${b}<a href="${href}">${mail}</a>`;
        };
    }

    md2Html(text: any) {
        if (!text) return text;
        // 1. Perform a series of escape operations first, and use '¨' as the escape character to avoid md5 encoding problems
        text = text.replace(/¨/g, '¨T');
        text = text.replace(/\$/g, '¨D'); // replace $ with ¨D
        // Standardize the line position (unify mac, dos)
        text = text.replace(/\r\n/g, '\n'); // dos
        text = text.replace(/\r/g, '\n'); // mac

        text = text.replace(/\u00A0/g, '&nbsp;'); // normalize spaces
        // 2. Due to the grammatical characteristics of markdwon (one \n is not counted as a newline, two are counted), let the start and end of the text be a pair of newlines, so as to ensure that the first and last lines of the pasted content can be recognized normally
        text = `\n\n${text}\n\n`;
        // 3. Convert tab to space
        text = this.detab(text);
        // 4. Delete lines consisting only of spaces and tabs
        text = text.replace(/^[ \t]+$/gm, '');
        // 5. Start a wave of code blocks (compatible with github)
        text = this.github_code_block(text);
        // 6. Cache all html related content (such as in code blocks and inline code) to avoid affecting subsequent real conversion operations
        text = this.hash_html_blocks(text);
        // 7. Since the syntax of the latex formula and the code block syntax are always the same, the code tag needs to be cached to facilitate the subsequent completion of related capabilities
        text = this.hash_code_tags(text);
        // core conversion link
        text = this.block_gamut(text);
        // unhash
        text = this.unhash_html_spans(text);
        // escape special characters
        text = this.unescape_special_chars(text);
        text = text.replace(/¨D/g, '$$');
        // Escape the ¨ that comes with itself
        text = text.replace(/¨T/g, '¨');
        // Return whether md syntax is recognized
        const isConverted = this.convert_flag;
        this.init_global_var();
        return {
            text: text,
            isConverted: isConverted,
        };
    }

    private detab(text: any) {
        text = text.replace(/\t(?=\t)/g, ' '); // 1 tab === 4 space
        // turn \t into a placeholder
        text = text.replace(/\t/g, '¨A¨B');
        // Use placeholders to mark tabs to prevent regular backtracking
        text = text.replace(/¨B(.+?)¨A/g, (wholeMatch: any, m1: any) => {
            let leadingText = m1,
                numSpaces = 4 - (leadingText.length % 4);

            for (let i = 0; i < numSpaces; i++) {
                leadingText += ' ';
            }

            return leadingText;
        });
        // Convert placeholder to space
        text = text.replace(/¨A/g, ' ');
        text = text.replace(/¨B/g, '');
        return text;
    }

    private github_code_block(text: any) {
        text += '¨0';
        text = text.replace(
            /(?:^|\n)(?: {0,3})(```+|~~~+)(?: *)([^\s`~]*)\n([\s \S]*?)\n(?: {0,3})\1/g,
            (wholeMatch: any, delim: any, language: any, codeblock: any) => {
                const end = '\n';
                this.convert_flag = true;
                // TODO:
                // codeblock = String.unescapeEntities(codeblock); // Since the outside is escaped, the escape is returned here
                codeblock = this.encode_code(codeblock);
                codeblock = this.detab(codeblock);
                codeblock = codeblock.replace(/^\n+/g, ''); // delete empty lines
                codeblock = codeblock.replace(/\n+$/g, ''); // trailing spaces removed
                codeblock = `${
                    '<pre><code' + 'vodka-language="'
                }${language}">${codeblock}${end}</code></pre>`;
                codeblock = this.hash_block(codeblock); // prevent codeblck from false positives, the bottom line: cache raw text and parsed text in the instance

                return `\n\n¨G${
                    this.code_blocks.push({
                        text: wholeMatch,
                        codeblock: codeblock,
                    }) - 1
                }G\n\n`;
            }
        );
        text = text.replace(/¨0/, '');
        return text;
    }

    private encode_code(text: any) {
        text = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;') // escape all special characters (used by md syntax)
            // eslint-disable-next-line
            .replace(/([*_{}\[\]\\=~-])/g, this.escape_characters_callback);
        return text;
    }

    private escape_characters_callback(param: any, m1: any) {
        const charCodeToEscape = m1.charCodeAt(0);
        return `¨E${charCodeToEscape}E`;
    }

    private hash_block(text: any) {
        text = text.replace(/(^\n+|\n+$)/g, '');
        text = `\n\n¨K${this.html_blocks.push(text) - 1}K\n\n`;
        return text;
    }

    private hash_html_blocks(text: any) {
        const blockTags = [
            'pre',
            'div',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'blockquote',
            'table',
            'dl',
            'ol',
            'ul',
            'script',
            'noscript',
            'form',
            'fieldset',
            'iframe',
            'math',
            'style',
            'section',
            'header',
            'footer',
            'nav',
            'article',
            'aside',
            'address',
            'audio',
            'canvas',
            'figure',
            'hgroup',
            'output',
            'video',
            'p',
        ];
        const repFunc = (
            wholeMatch: any,
            match: any,
            left: any,
            right: any
        ) => {
            const txt = wholeMatch;
            return `\n\n¨K${this.html_blocks.push(txt) - 1}K\n\n`;
        };

        for (let i = 0; i < blockTags.length; ++i) {
            let opTagPos: any;
            const rgx1 = new RegExp(`^ {0,3}(<${blockTags[i]}\\b[^>]*>)`, 'im');
            const patLeft = `<${blockTags[i]}\\b[^>]*>`;
            const patRight = `</${blockTags[i]}>`; // 1. Find the first position of the first open HTML tag in the text

            while ((opTagPos = this.regex_index_of(text, rgx1)) !== -1) {
                //2. Split text at this position
                const subTexts = this.split_at_index(text, opTagPos),
                    //3. Recursive matching
                    newSubText1 = this.replace_recursive_reg_exp(
                        subTexts[1],
                        repFunc,
                        patLeft,
                        patRight,
                        'im'
                    ); // prevent infinite loop

                if (newSubText1 === subTexts[1]) {
                    break;
                }

                text = subTexts[0].concat(newSubText1);
            }
        } // Special case handling: hr tag

        text = text.replace(
            /(\n {0,3}(<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g,
            this.hash_element()
        ); // special handling of independent html comments

        text = this.replace_recursive_reg_exp(
            text,
            (txt: any) => {
                return `\n\n¨K${this.html_blocks.push(txt) - 1}K\n\n`;
            },
            '^{0,3}<!--',
            '-->',
            'gm'
        ); // PHP tag handling (<?...?> / <%...%>)
        text = text.replace(
            /(?:\n\n)( {0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g,
            this.hash_element()
        );
        return text;
    }

    private regex_index_of(str: any, regex: any, fromIndex?: any) {
        if (!isString(str)) {
            throw 'The first parameter of regex_index_of must be a string';
        }

        if (regex instanceof RegExp === false) {
            throw 'The second parameter of regex_index_of must be a regular expression instance';
        }

        const indexOf = str.substring(fromIndex || 0).search(regex);
        return indexOf >= 0 ? indexOf + (fromIndex || 0) : indexOf;
    }

    private split_at_index(str: any, index: any) {
        if (!isString(str)) {
            throw 'The first parameter of split_at_index must be a string';
        }

        return [str.substring(0, index), str.substring(index)];
    }

    private replace_recursive_reg_exp(
        str: any,
        replacement: any,
        left: any,
        right: any,
        flags: any
    ) {
        if (!isFunction(replacement)) {
            const repStr = replacement;

            replacement = function () {
                return repStr;
            };
        }

        let matchPos = this.rgx_find_match_pos(str, left, right, flags),
            finalStr = str,
            lng = matchPos.length;

        if (lng > 0) {
            const bits: any[] = [];

            if (matchPos[0].wholeMatch.start !== 0) {
                bits.push(str.slice(0, matchPos[0].wholeMatch.start));
            }

            for (let i = 0; i < lng; ++i) {
                bits.push(
                    replacement(
                        str.slice(
                            matchPos[i].wholeMatch.start,
                            matchPos[i].wholeMatch.end
                        ),
                        str.slice(
                            matchPos[i].match.start,
                            matchPos[i].match.end
                        ),
                        str.slice(matchPos[i].left.start, matchPos[i].left.end),
                        str.slice(
                            matchPos[i].right.start,
                            matchPos[i].right.end
                        )
                    )
                );

                if (i < lng - 1) {
                    bits.push(
                        str.slice(
                            matchPos[i].wholeMatch.end,
                            matchPos[i + 1].wholeMatch.start
                        )
                    );
                }
            }

            if (matchPos[lng - 1].wholeMatch.end < str.length) {
                bits.push(str.slice(matchPos[lng - 1].wholeMatch.end));
            }

            finalStr = bits.join('');
        }

        return finalStr;
    }

    private rgx_find_match_pos(str: any, left: any, right: any, flags: any) {
        let f = flags || '',
            g = f.indexOf('g') > -1,
            x = new RegExp(`${left}|${right}`, `g${f.replace(/g/g, '')}`),
            l = new RegExp(left, f.replace(/g/g, '')),
            pos: any[] = [],
            t: any,
            s: any,
            m: any,
            start: any,
            end: any;

        do {
            t = 0;

            while ((m = x.exec(str))) {
                if (l.test(m[0])) {
                    if (!t++) {
                        s = x.lastIndex;
                        start = s - m[0].length;
                    }
                } else if (t) {
                    if (!--t) {
                        end = m.index + m[0].length;
                        const obj = {
                            left: {
                                start: start,
                                end: s,
                            },
                            match: {
                                start: s,
                                end: m.index,
                            },
                            right: {
                                start: m.index,
                                end: end,
                            },
                            wholeMatch: {
                                start: start,
                                end: end,
                            },
                        } as any;
                        pos.push(obj);

                        if (!g) {
                            return pos;
                        }
                    }
                }
            }
        } while (t && (x.lastIndex = s));

        return pos;
    }

    private hash_element() {
        return function (this: any, wholeMatch: any, m1: any) {
            let blockText = m1; // remove double line breaks

            blockText = blockText.replace(/\n\n/g, '\n');
            blockText = blockText.replace(/^\n/, ''); // delete blank lines

            blockText = blockText.replace(/\n+$/g, ''); // replace the text of the element with a placeholder (eg x in "¨KxK" is text)

            blockText = `\n\n¨K${this.html_blocks.push(blockText) - 1}K\n\n`;
            return blockText;
        };
    }
    private hash_code_tags(text: any) {
        const repFunc = (
            wholeMatch: any,
            match: any,
            left: any,
            right: any
        ) => {
            const codeblock = left + this.encode_code(match) + right;
            return `¨C${this.html_spans.push(codeblock) - 1}C`;
        };

        text = this.replace_recursive_reg_exp(
            text,
            repFunc,
            '<code\\b[^>]*>',
            '</code>',
            'gim'
        );
        return text;
    }

    private encode_amps_and_angles(text: any) {
        text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g, '&amp;');
        // eslint-disable-next-line
        text = text.replace(/<(?![a-z\/?$!])/gi, '&lt;');
        text = text.replace(/</g, '&lt;');
        text = text.replace(/>/g, '&gt;');
        return text;
    }

    private block_gamut(text: any) {
        // 1. Convert the reference to ensure that the title and blank lines in the reference are processed without polluting the subsequent process
        text = this.block_quotes(text); // Quotes are temporarily not recognized
        // 2. Convert the title
        text = this.headers(text);
        // 3. Horizontal dividing line
        text = this.horizontal_rule(text);
        // 4. List
        text = this.lists(text);
        // 6. Form
        text = this.tables(text);
        // 7. Cache all html tags
        text = this.hash_html_blocks(text);
        // 8. Paragraph
        text = this.paragraphs(text);
        return text;
    }

    private block_quotes(text: any) {
        text = `${text}\n\n`;
        const rgx = /(^ {0,3}&gt;[ \t]?.+\n(.+\n)*\n*)+/gm;
        text = text.replace(rgx, (bq: any) => {
            bq = bq.replace(/^[ \t]*&gt;[ \t]?/gm, ''); // prevent hack attacks

            bq = bq.replace(/¨0/g, '');
            bq = bq.replace(/^[ \t]+$/gm, ''); // delete lines with only spaces

            bq = this.block_gamut(bq);
            bq = bq.replace(/(^|\n)/g, '$1 '); // remove the space before the pre tag

            bq = bq.replace(
                /(\s*<pre>[^\r]+?<\/pre>)/gm,
                function (wholeMatch: any, m1: any) {
                    let pre = m1;
                    pre = pre.replace(/^ {2}/gm, '¨0');
                    pre = pre.replace(/¨0/g, '');
                    return pre;
                }
            );
            return this.hash_block(`<blockquote>\n${bq}\n</blockquote>`);
        });
        return text;
    }

    private headers(text: any) {
        // ## Header, ## Header ##
        const headerLevelStart = 1;
        const atxStyle = /^(#{1,6})[ \t]*(.+?)[ \t]*#*\n+/gm;

        function getStrCount(scrstr: any, armstr: any) {
            // scrstr source string armstr special characters
            let count = 0;

            while (scrstr.indexOf(armstr) != -1) {
                scrstr = scrstr.replace(armstr, '');
                count++;
            }

            return count;
        }

        text = text.replace(atxStyle, (wholeMatch: any, m1: any, m2: any) => {
            this.convert_flag = true;
            const tagCount = getStrCount(wholeMatch, '#');

            if (tagCount > 5) {
                return wholeMatch; // more than 5 # ignore
            }

            const hText = m2;
            const span = this.span_gamut(hText),
                hLevel = headerLevelStart - 1 + m1.length,
                header = `<h${hLevel}>${span}</h${hLevel}>`;
            return this.hash_block(header);
        });
        return text;
    }

    private span_gamut(text: any) {
        text = this.escape_special_chars_within_tag_attributes(text);
        text = this.encode_backslash_escapes(text); // Process links and pictures, pictures need to be processed first, because the picture syntax and link syntax overlap: ![alt][url] => [title][url]

        text = this.images(text);
        text = this.anchors(text);
        text = this.auto_links(text); // underline, bold, italic, strikethrough

        text = this.underline(text);
        text = this.italics_and_bold(text);
        text = this.strikethrough(text); // cache html tags

        text = this.hash_html_spans(text); // escape the html tags

        text = this.encode_amps_and_angles(text); // space + \n => <br />\n

        text = text.replace(/ +\n/g, '<br />\n');
        return text;
    }

    private hash_html_spans(text: any) {
        // 1. Cache self-closing tags
        text = text.replace(/<[^>]+?\/>/gi, (wm: any) => {
            return this.hash_html_span(wm);
        });
        // 2. Cache tags without attributes
        text = text.replace(/<([^>]+?)>[\s\S]*?<\/\1>/g, (wm: any) => {
            return this.hash_html_span(wm);
        });
        // 3. Cache pending attribute tags
        text = text.replace(/<([^>]+?)\s[^>]+?>[\s\S]*?<\/\1>/g, (wm: any) => {
            return this.hash_html_span(wm);
        });
        // 4. Cache self-closing and tags without slashes
        text = text.replace(/<[^>]+?>/gi, (wm: any) => {
            return this.hash_html_span(wm);
        });
        return text;
    }
    private hash_html_span(html: any) {
        return `¨C${this.html_spans.push(html) - 1}C`;
    }

    private escape_special_chars_within_tag_attributes(text: any) {
        const tags = /<\/?[a-z\d_:-]+(?:[\s]+[\s\S]+?)?>/gi,
            comments = /<!(--(?:(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)>/gi;
        text = text.replace(tags, (wholeMatch: any) => {
            return wholeMatch
                .replace(/(.)<\/?code>(?=.)/g, '$1`')
                .replace(/([\\`*_~=|])/g, this.escape_characters_callback);
        });
        text = text.replace(comments, (wholeMatch: any) => {
            return wholeMatch.replace(
                /([\\`*_~=|])/g,
                this.escape_characters_callback
            );
        });
        return text;
    }

    private encode_backslash_escapes(text: any) {
        text = text.replace(/\\(\\)/g, this.escape_characters_callback);
        text = text.replace(
            // eslint-disable-next-line
            /\\([`*_{}\[\]()>#+.!~=|:-])/g,
            this.escape_characters_callback
        );
        return text;
    }

    private images(text: any) {
        const backupText = text;
        const inlineRegExp =
                /!\[([^\]]*?)][ \t]*()\([ \t]?<?([\S]+?(?:\([\S]*?\)[\S]*?)?)>?(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(["'])([^"]*?)\6)?[ \t]?\)/g,
            crazyRegExp =
                /!\[([^\]]*?)][ \t]*()\([ \t]?<([^>]*)>(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(?:(["'])([^"]*?)\6))?[ \t]?\)/g,
            base64RegExp =
                /!\[([^\]]*?)][ \t]*()\([ \t]?<?(data:.+?\/.+?;base64,[A-Za-z0-9+/=\n]+?)>?(?: =([*\d]+[A-Za-z%]{0,4})x([*\d]+[A-Za-z%]{0,4}))?[ \t]*(?:(["'])([^"]*?)\6)?[ \t]?\)/g,
            referenceRegExp =
                /!\[([^\]]*?)] ?(?:\n *)?\[([\s\S]*?)]()()()()()/g,
            // eslint-disable-next-line
            refShortcutRegExp = /!\[([^\[\]]+)]()()()()()/g;

        function writeImageTagBase64(
            wholeMatch: any,
            altText: any,
            linkId: any,
            url: any,
            width: any,
            height: any,
            m5: any,
            title: any
        ) {
            url = url.replace(/\s/g, '');
            return writeImageTag.call(
                // @ts-ignore
                this,
                wholeMatch,
                altText,
                linkId,
                url,
                width,
                height,
                m5,
                title
            );
        }

        function writeImageTag(
            wholeMatch: any,
            altText: any,
            linkId: any,
            url: any,
            width: any,
            height: any,
            m5: any,
            title: any
        ) {
            // @ts-ignore
            const gUrls = this.gUrls,
                // @ts-ignore
                gTitles = this.gTitles,
                // @ts-ignore
                gDims = this.gDimensions;
            // @ts-ignore
            this.convert_flag = true;
            linkId = linkId.toLowerCase();

            if (!title) {
                title = '';
            } // Compatible with special case: nothing is written in url

            if (wholeMatch.search(/\(<?\s*>??(['"].*['"])?\)$/m) > -1) {
                url = '';
            } else if (url === '' || url === null) {
                if (linkId === '' || linkId === null) {
                    // lowercase and convert \n to spaces
                    linkId = altText.toLowerCase().replace(/ ?\n/g, ' ');
                }

                url = `#${linkId}`;
                /** handle footnotes */
                if (gUrls[linkId] !== undefined) {
                    url = gUrls[linkId];

                    if (gTitles[linkId] !== undefined) {
                        title = gTitles[linkId];
                    }

                    if (gDims[linkId] !== undefined) {
                        width = gDims[linkId].width;
                        height = gDims[linkId].height;
                    }
                } else {
                    return wholeMatch;
                }
            }
            /** handle alt */

            altText = altText.replace(/"/g, '&quot;').replace(
                MarkdownParser.regexes.asteriskDashTildeAndColon,
                // @ts-ignore
                this.escape_characters_callback
            );
            url = url.replace(
                MarkdownParser.regexes.asteriskDashTildeAndColon,
                // @ts-ignore
                this.escape_characters_callback
            );
            if (/^\//.test(url)) {
                // start with a slash, change to local
                url = `file:/${url}`;
            }
            let result = `<img src="${url}" alt="${altText}"`;
            /** title */

            if (title && isString(title)) {
                title = title.replace(/"/g, '&quot;').replace(
                    MarkdownParser.regexes.asteriskDashTildeAndColon,
                    // @ts-ignore
                    this.escape_characters_callback
                );
                result += `title="${title}"`;
            }
            /** Width Height */
            if (width && height) {
                width = width === '*' ? 'auto' : width;
                height = height === '*' ? 'auto' : height;
                result += `width="${width}"`;
                result += `height="${height}"`;
            }

            result += ' />';
            return result;
        }
        // 1. Normal image syntax ![alt text][id]
        text = text.replace(referenceRegExp, writeImageTag.bind(this)); // 2. Inline image syntax: ![alt text](url =<width>x<height> "optional title"), divided into different urls base64, ./image/cat1, normal url
        // base64
        text = text.replace(base64RegExp, writeImageTagBase64.bind(this)); // special case ./image/cat1).png
        text = text.replace(crazyRegExp, writeImageTag.bind(this)); // normal case
        text = text.replace(inlineRegExp, writeImageTag.bind(this)); // 3. Shorthand syntax![img text]
        text = text.replace(refShortcutRegExp, writeImageTag.bind(this));
        return text;
    }

    private anchors(text: any) {
        const writeAnchorTag = (
            wholeMatch: any,
            linkText: any,
            linkId: any,
            url: any,
            m5: any,
            m6: any,
            title: any
        ) => {
            if (title === undefined) {
                title = '';
            }

            this.convert_flag = true;
            linkId = linkId.toLowerCase(); // special case: url is empty

            if (wholeMatch.search(/\(<?\s*>??(['"].*['"])?\)$/m) > -1) {
                url = '';
            } else if (!url) {
                if (!linkId) {
                    // lowercase and convert \n to spaces
                    linkId = linkText.toLowerCase().replace(/ ?\n/g, ' ');
                }

                url = `#${linkId}`;
                /** handle footnotes */
                if (this.gUrls[linkId] !== undefined) {
                    url = this.gUrls[linkId];

                    if (this.gTitles[linkId] !== undefined) {
                        title = this.gTitles[linkId];
                    }
                } else {
                    return wholeMatch;
                }
            }

            url = url.replace(
                MarkdownParser.regexes.asteriskDashTildeAndColon,
                this.escape_characters_callback
            );
            let result = `<a href="${url}"`;

            if (title !== '' && title !== null) {
                title = title.replace(/"/g, '&quot;');
                title = title.replace(
                    MarkdownParser.regexes.asteriskDashTildeAndColon,
                    this.escape_characters_callback
                );
                result += `title="${title}"`;
            }

            if (!/^#/.test(url)) {
                // escaped
                result += ' rel="noopener noreferrer" target="¨E95Eblank"';
            }

            result += `>${linkText || url || ''}</a>`;
            return result;
        }; // 1. Normal syntax: [link text] [id]

        text = text.replace(
            // eslint-disable-next-line
            /\[((?:\[[^\]]*]|[^\[\]])*)] ?(?:\n *)?\[(.*?)]()()( )()/g,
            writeAnchorTag.bind(this)
        ); // 2. Inline syntax: [link text](url "optional title")
        // Special url writing: ./image/cat1).png
        text = text.replace(
            // eslint-disable-next-line
            /\[((?:\[[^\]]*]|[^\[\]])*)]()[ \t]*\([ \t]?<([^>]*) >(?:[ \t]*((["'])([^"]*?)\5))?[ \t]?\)/g,
            writeAnchorTag.bind(this)
        ); // normal case
        text = text.replace(
            // eslint-disable-next-line
            /\[((?:\[[^\]]*]|[^\[\]])*)]()[ \t]*\([ \t]?<?([\S]+ ?(?:\([\S]*?\)[\S]*?)?)>?(?:[ \t]*((["'])([^"]*?)\5 ))?[ \t]?\)/g,
            writeAnchorTag.bind(this)
        ); // Shorthand syntax: [link text]
        // Consider footnotes: [link test][1]
        // and special notation: [link test](/foo)
        text = text.replace(
            // eslint-disable-next-line
            /\[([^\[\]]+)]()()()()()/g,
            writeAnchorTag.bind(this)
        );
        return text;
    }
    private auto_links(text: any) {
        text = text.replace(
            MarkdownParser.regexes.delimUrlRegex,
            this.replace_link.call(this)
        );
        text = text.replace(
            MarkdownParser.regexes.delimMailRegex,
            this.replace_mail.call(this)
        );
        return text;
    }

    private unescape_special_chars(text: any) {
        text = text.replace(/¨E(\d+)E/g, function (wholeMatch: any, m1: any) {
            const charCodeToReplace = parseInt(m1);
            return String.fromCharCode(charCodeToReplace);
        });
        return text;
    }

    private underline(text: any) {
        text = text.replace(/___(\S[\s\S]*?)___/g, (wm: any, m: any) => {
            this.convert_flag = true;
            return /\S$/.test(m) ? `<u>${m}</u>` : wm;
        });
        text = text.replace(/__(\S[\s\S]*?)__/g, (wm: any, m: any) => {
            this.convert_flag = true;
            return /\S$/.test(m) ? `<u>${m}</u>` : wm;
        });
        return text;
    }

    private italics_and_bold(text: any) {
        function parseInside(txt: any, left: any, right: any) {
            return left + txt + right;
        }

        text = text.replace(/__(\S[\s\S]*?)__/g, (wm: any, m: any) => {
            this.convert_flag = true;
            return /\S$/.test(m) ? parseInside(m, '<strong>', '</strong>') : wm;
        });

        text = text.replace(/\*\*\*(\S[\s\S]*?)\*\*\*/g, (wm: any, m: any) => {
            this.convert_flag = true;
            return /\S$/.test(m)
                ? parseInside(m, '<strong><em>', '</em></strong>')
                : wm;
        });
        text = text.replace(/\*\*(\S[\s\S]*?)\*\*/g, (wm: any, m: any) => {
            this.convert_flag = true;
            return /\S$/.test(m) ? parseInside(m, '<strong>', '</strong>') : wm;
        });
        text = text.replace(/\*([^\s*][\s\S]*?)\*/g, (wm: any, m: any) => {
            // !/^\*[^*]/.test(m) - not preceded by "**" (may be redundant, delete it so as not to affect subsequent syntax checking)
            this.convert_flag = true;
            return /\S$/.test(m) ? parseInside(m, '<em>', '</em>') : wm;
        });
        return text;
    }

    private strikethrough(text: any) {
        text = text.replace(
            /(?:~){2}([\s\S]+?)(?:~){2}/g,
            (wm: any, txt: any) => {
                this.convert_flag = true;
                return `<s>${txt}</s>`;
            }
        );
        return text;
    }

    private horizontal_rule(text: any) {
        const key = this.hash_block('<hr />');
        text = text.replace(/^ {0,2}( ?-){3,}[ \t]*$/gm, () => {
            this.convert_flag = true;
            return key;
        });
        text = text.replace(/^ {0,2}( ?\*){3,}[ \t]*$/gm, () => {
            this.convert_flag = true;
            return key;
        });
        text = text.replace(/^ {0,2}( ?_){3,}[ \t]*$/gm, () => {
            this.convert_flag = true;
            return key;
        });
        return text;
    }

    private lists(text: any) {
        /**
         * Process a single ordered or unordered list, splitting it into separate list items
         * @param {string} listStr
         * @param {boolean} trimTrailing
         * @returns {string}
         */
        const processListItems = (listStr: any, trimTrailing: any) => {
            // list_level keeps track of when we enter the list, and every time we enter the list, this property is incremented
            // When the list ends, the value is decremented; if the value is 0, it is not currently in any list
            //
            // special case:
            //
            // blah blah blah blah blah blah, for example, a value is
            // 8. At this point, the following line will be treated as a sublist
            // I will be treated as a sublist
            //
            // The list is difficult to parse perfectly, and there are many problems with its handling by showdown, but there is no better solution in the community
            // @ts-ignore
            this.list_level++; // empty line to kill

            listStr = listStr.replace(/\n{2,}$/, '\n'); // emulate \Z

            listStr += '¨0';
            const rgx =
                    /(\n)?(^ {0,3})([*+-]|\d+[.])[ \t]+((\[(x|X| )?])?[ \t] *[^\r]+?(\n{1,2}))(?=\n*(¨0| {0,3}([*+-]|\d+[.])[ \t] +))/gm,
                isParagraphed = /\n[ \t]*\n(?!¨0)/.test(listStr);
            listStr = listStr.replace(
                rgx,
                (
                    wholeMatch: any,
                    m1: any,
                    m2: any,
                    m3: any,
                    m4: any,
                    taskbtn: any,
                    checked: any
                ) => {
                    checked = checked && checked.trim() !== '';
                    let item = this.outdent(m4),
                        bulletStyle = ''; // ISSUE for showdown: 312

                    item = item.replace(
                        /^([-*+]|\d\.)[ \t]+[\S\n ]*/g,
                        function (wm2: any) {
                            return `¨A${wm2}`;
                        }
                    ); // special case:
                    // - # zbc
                    // zbczbc

                    if (/^#+.+\n.+/.test(item)) {
                        item = item.replace(/^(#+.+)$/m, '$1\n');
                    }

                    if (m1 || item.search(/\n{2,}/) > -1) {
                        item = this.github_code_block(item); // code block in list
                        item = this.block_gamut(item);
                    } else {
                        // sublist recursion
                        item = this.lists(item);
                        item = item.replace(/\n$/, ''); // chomp(item)

                        item = this.hash_html_blocks(item); // Double wrapping is folded, keeping at most double wrapping

                        item = item.replace(/\n\n+/g, '\n\n');

                        if (isParagraphed) {
                            item = this.paragraphs(item);
                        } else {
                            item = this.span_gamut(item);
                        }
                    } // reverse escaping

                    item = item.replace('¨A', '');
                    item = `<li${bulletStyle}>${item}</li>\n`;
                    return item;
                }
            );
            listStr = listStr.replace(/¨0/g, '');
            // @ts-ignore
            this.list_level--;

            if (trimTrailing) {
                listStr = listStr.replace(/\s+$/, '');
            }

            return listStr;
        };

        function styleStartNumber(list: any, listType: any) {
            // is ol and does not start with 1
            if (listType === 'ol') {
                const res = list.match(/^ *(\d+)\./);

                if (res && res[1] !== '1') {
                    return `start="${res[1]}"`;
                }
            }

            return '';
        }
        /**
         * Check and parse consecutive lists
         * @param {string} list
         * @param {string} listType
         * @param {boolean} trimTrailing
         * @returns {string}
         */

        function parseConsecutiveLists(
            list: any,
            listType: any,
            trimTrailing: any
        ) {
            // Check if we are capturing multiple lists by mistake
            // If there is an error capture, swap ol and ul at the location where the error is captured
            // Due to the particularity of the checkbox, the checkbox is not considered in this position
            let olRgx = /^ {0,3}\d+\.[ \t]/gm,
                ulRgx = /^ {0,3}[*+-][ \t]/gm,
                counterRxg = listType === 'ul' ? olRgx : ulRgx,
                result = '';

            if (list.search(counterRxg) !== -1) {
                // @ts-ignore
                this.convert_flag = true;
                (function parse_cl(this: any, txt: any) {
                    const pos = txt.search(counterRxg),
                        style = styleStartNumber(list, listType);

                    if (pos !== -1) {
                        // slice
                        result += `\n\n<${listType}${style}>\n${processListItems.call(
                            this,
                            txt.slice(0, pos),
                            !!trimTrailing
                        )}</${listType}>\n`; // swap ol and ul

                        listType = listType === 'ul' ? 'ol' : 'ul';
                        counterRxg = listType === 'ul' ? olRgx : ulRgx; // continue

                        parse_cl.call(this, txt.slice(pos));
                    } else {
                        result += `\n\n<${listType}${style}>\n${processListItems.call(
                            this,
                            txt,
                            !!trimTrailing
                        )}</${listType}>\n`;
                    }
                    // @ts-ignore
                }.call(this, list));
            } else {
                const style = styleStartNumber(list, listType);

                if (listType === 'ul') {
                    // @ts-ignore
                    this.convert_flag = true; // individual unordered lists can be converted
                }

                result = `\n\n<${listType}${style}>\n${processListItems.call(
                    // @ts-ignore
                    this,
                    list,
                    !!trimTrailing
                )}</${listType}>\n`;
            }

            return result;
        }

        const subListRgx =
            /^(( {0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(¨0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;
        const mainListRgx =
            /(\n\n|^\n?)(( {0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(¨0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;
        text += '¨0';

        if (this.list_level) {
            text = text.replace(
                subListRgx,
                (wholeMatch: any, list: any, m2: any) => {
                    const listType = m2.search(/[*+-]/g) > -1 ? 'ul' : 'ol';
                    return parseConsecutiveLists.call(
                        this,
                        list,
                        listType,
                        true
                    );
                }
            );
        } else {
            text = text.replace(
                mainListRgx,
                (wholeMatch: any, m1: any, list: any, m3: any) => {
                    const listType = m3.search(/[*+-]/g) > -1 ? 'ul' : 'ol';
                    return parseConsecutiveLists.call(
                        this,
                        list,
                        listType,
                        false
                    );
                }
            );
        }

        text = text.replace(/¨0/, '');
        return text;
    }

    private paragraphs(text: any) {
        // get rid of the leading and trailing \n
        text = text.replace(/^\n+/g, '');
        text = text.replace(/\n+$/g, '');
        const grafs = text.split(/\n{2,}/g);
        const grafsOut: any[] = [];
        let end = grafs.length; // wrap the p tag

        for (let i = 0; i < end; i++) {
            let str = grafs[i]; // cache html tags

            if (str.search(/¨(K|G)(\d+)\1/g) >= 0) {
                grafsOut.push(str); // new empty line exists as p tag
            } else if (str.search(/\S/) >= 0) {
                str = this.span_gamut(str);
                str = str.replace(/^([ \t]*)/g, '<div>');
                str += '</div>';
                grafsOut.push(str);
            }
        }
        /** unhash */

        end = grafsOut.length;

        for (let i = 0; i < end; i++) {
            let blockText = '',
                grafsOutIt = grafsOut[i],
                codeFlag = false;

            while (/¨(K|G)(\d+)\1/.test(grafsOutIt)) {
                const delim = RegExp.$1;
                const num = parseInt(RegExp.$2);

                if (delim === 'K') {
                    blockText = this.html_blocks[num];
                } else {
                    // Determine whether the current parsed content is in other grammar blocks
                    if (codeFlag) {
                        blockText = this.encode_code(
                            this.code_blocks[num].text
                        );
                    } else {
                        blockText = this.code_blocks[num].codeblock;
                    }
                }

                blockText = blockText.replace(/\$/g, '$$$$'); // $ character conversion

                grafsOutIt = grafsOutIt.replace(
                    /(\n\n)?¨(K|G)\d+\2(\n\n)?/,
                    blockText
                );

                if (/^<pre\b[^>]*>\s*<code\b[^>]*>/.test(grafsOutIt)) {
                    codeFlag = true;
                }
            }

            grafsOut[i] = grafsOutIt;
        }

        text = grafsOut.join('\n'); // remove newline

        text = text.replace(/^\n+/g, '');
        text = text.replace(/\n+$/g, '');
        return text;
    }
    private tables(text: any) {
        const tableRgx =
                /^ {0,3}\|?.+\|.+\n {0,3}\|?[ \t]*:?[ \t]*(?:[-=]){2,}[ \t]*:?[ \t]*\|[ \t]*:?[ \t]*(?:[-=]){2,}[\s\S]+?(?:\n\n|¨0)/gm,
            singeColTblRgx =
                /^ {0,3}\|.+\|[ \t]*\n {0,3}\|[ \t]*:?[ \t]*(?:[-=]){2,}[ \t]*:?[ \t]*\|[ \t]*\n( {0,3}\|.+\|[ \t]*\n)*(?:\n|¨0)/gm;

        function parseStyles(sLine: any) {
            if (/^:[ \t]*--*$/.test(sLine)) {
                return ' style="text-align:left;"';
            } else if (/^--*[ \t]*:[ \t]*$/.test(sLine)) {
                return ' style="text-align:right;"';
            } else if (/^:[ \t]*--*[ \t]*:$/.test(sLine)) {
                return ' style="text-align:center;"';
            } else {
                return '';
            }
        }

        function parseHeaders(header: any, style: any) {
            header = header.trim();
            // @ts-ignore
            header = this.span_gamut(header);
            return `<th${style}>${header}</th>\n`;
        }

        function parseCells(cell: any, style: any) {
            // @ts-ignore
            const subText = this.span_gamut(cell);
            return `<td${style}>${subText}</td>\n`;
        }

        function buildTable(headers: any, cells: any) {
            let tb = '<table>\n<thead>\n<tr>\n',
                tblLgn = headers.length;

            for (let i = 0; i < tblLgn; ++i) {
                tb += headers[i];
            }

            tb += '</tr>\n</thead>\n<tbody>\n';

            for (let i = 0; i < cells.length; ++i) {
                tb += '<tr>\n';

                for (let ii = 0; ii < tblLgn; ++ii) {
                    tb += cells[i][ii];
                }

                tb += '</tr>\n';
            }

            tb += '</tbody>\n</table>\n';
            return tb;
        }

        function parseTable(this: any, rawTable: any) {
            let i: any,
                tableLines = rawTable.split('\n');
            this.convert_flag = true;

            for (i = 0; i < tableLines.length; ++i) {
                if (/^ {0,3}\|/.test(tableLines[i])) {
                    tableLines[i] = tableLines[i].replace(/^ {0,3}\|/, '');
                }

                if (/\|[ \t]*$/.test(tableLines[i])) {
                    tableLines[i] = tableLines[i].replace(/\|[ \t]*$/, '');
                }
            }

            const rawHeaders = (tableLines[0] || '')
                .split('|')
                .map(function (s: any) {
                    return s.trim();
                });
            const rawStyles = (tableLines[1] || '')
                .split('|')
                .map(function (s: any) {
                    return s.trim();
                });
            const rawCells: any[] = [];
            const headers: any[] = [];
            const styles: any[] = [];
            const cells: any[] = [];
            tableLines.shift();
            tableLines.shift();

            for (i = 0; i < tableLines.length; ++i) {
                if (tableLines[i].trim() === '') {
                    continue;
                }

                rawCells.push(
                    (tableLines[i] || '').split('|').map(function (s: any) {
                        return s.trim();
                    })
                );
            }

            if (rawHeaders.length < rawStyles.length) {
                return rawTable;
            }

            for (i = 0; i < rawStyles.length; ++i) {
                styles.push(parseStyles(rawStyles[i]));
            }

            for (i = 0; i < rawHeaders.length; ++i) {
                if (styles[i] === undefined) {
                    styles[i] = '';
                }

                headers.push(parseHeaders.call(this, rawHeaders[i], styles[i]));
            }

            for (i = 0; i < rawCells.length; ++i) {
                const row: any[] = [];

                for (let ii = 0; ii < headers.length; ++ii) {
                    if (rawCells[i][ii] === undefined) {
                        return rawTable;
                    }

                    row.push(
                        parseCells.call(this, rawCells[i][ii], styles[ii])
                    );
                }

                cells.push(row);
            }

            return buildTable(headers, cells);
        }

        text = text.replace(/\\(\|)/g, this.escape_characters_callback); // Multi-column form

        text = text.replace(tableRgx, parseTable.bind(this)); // single-column table

        text = text.replace(singeColTblRgx, parseTable.bind(this));
        return text;
    }

    private unhash_html_spans(text: any) {
        for (let i = 0; i < this.html_spans.length; ++i) {
            let repText = this.html_spans[i],
                // recursion counter to prevent infinite loop, pop the loop when it is 10
                limit = 0;

            while (/¨C(\d+)C/.test(repText)) {
                const num = parseInt(RegExp.$1);
                repText = repText.replace(`¨C${num}C`, this.html_spans[num]);

                if (limit === 10) {
                    break;
                }

                ++limit;
            }

            text = text.replace(`¨C${i}C`, repText);
        }

        return text;
    }

    private outdent(text: any) {
        text = text.replace(/^(\t|[ ]{1,4})/gm, '¨0'); // clear the flag

        text = text.replace(/¨0/g, '');
        return text;
    }
}

export { MarkdownParser };
