#!/usr/bin/env bash

#
# Steps:
#
#  1. Download corresponding html file for some README.md:
#       curl -s $1
#
#  2. Discard rows where no substring 'user-content-' (github's markup):
#       awk '/user-content-/ { ...
#
#  3.1 Get last number in each row like ' ... </span></a>sitemap.js</h1'.
#      It's a level of the current header:
#       substr($0, length($0), 1)
#
#  3.2 Get level from 3.1 and insert corresponding number of spaces before '*':
#       sprintf("%*s", (level-1)*'"$nb_spaces"', "")
#
#  4. Find head's text and insert it inside "* [ ... ]":
#       substr($0, match($0, /a>.*<\/h/)+2, RLENGTH-5)
#
#  5. Find anchor and insert it inside "(...)":
#       substr($0, match($0, "href=\"[^\"]+?\" ")+6, RLENGTH-8)
#

gh_toc_version="0.8.0"

gh_user_agent="gh-md-toc v$gh_toc_version"

#
# Download rendered into html README.md by its url.
#
#
gh_toc_load() {
    local gh_url=$1

    if type curl &>/dev/null; then
        curl --user-agent "$gh_user_agent" -s "$gh_url"
    elif type wget &>/dev/null; then
        wget --user-agent="$gh_user_agent" -qO- "$gh_url"
    else
        echo "Please, install 'curl' or 'wget' and try again."
        exit 1
    fi
}

#
# Converts local md file into html by GitHub
#
# -> curl -X POST --data '{"text": "Hello world github/linguist#1 **cool**, and #1!"}' https://api.github.com/markdown
# <p>Hello world github/linguist#1 <strong>cool</strong>, and #1!</p>'"
gh_toc_md2html() {
    local gh_file_md=$1
    local skip_header=$2

    URL=https://api.github.com/markdown/raw

    if [ ! -z "$GH_TOC_TOKEN" ]; then
        TOKEN=$GH_TOC_TOKEN
    else
        TOKEN_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/token.txt"
        if [ -f "$TOKEN_FILE" ]; then
            TOKEN="$(cat $TOKEN_FILE)"
        fi
    fi
    if [ ! -z "${TOKEN}" ]; then
        AUTHORIZATION="Authorization: token ${TOKEN}"
    fi

    local gh_tmp_file_md=$gh_file_md
    if [ "$skip_header" = "yes" ]; then
        if grep -Fxq "<!--te-->" $gh_src; then
          # cut everything before the toc
          gh_tmp_file_md=$gh_file_md~~
          sed '1,/<!--te-->/d' $gh_file_md > $gh_tmp_file_md
        fi
    fi

    # echo $URL 1>&2
    OUTPUT=$(curl -s \
        --user-agent "$gh_user_agent" \
        --data-binary @"$gh_tmp_file_md" \
        -H "Content-Type:text/plain" \
        -H "$AUTHORIZATION" \
        "$URL")

    rm -f $gh_file_md~~

    if [ "$?" != "0" ]; then
        echo "XXNetworkErrorXX"
    fi
    if [ "$(echo "${OUTPUT}" | awk '/API rate limit exceeded/')" != "" ]; then
        echo "XXRateLimitXX"
    else
        echo "${OUTPUT}"
    fi
}


#
# Is passed string url
#
gh_is_url() {
    case $1 in
        https* | http*)
            echo "yes";;
        *)
            echo "no";;
    esac
}

#
# TOC generator
#
gh_toc(){
    local gh_src=$1
    local gh_src_copy=$1
    local gh_ttl_docs=$2
    local need_replace=$3
    local no_backup=$4
    local no_footer=$5
    local indent=$6
    local skip_header=$7

    if [ "$gh_src" = "" ]; then
        echo "Please, enter URL or local path for a README.md"
        exit 1
    fi


    # Show "TOC" string only if working with one document
    if [ "$gh_ttl_docs" = "1" ]; then

        echo "Table of Contents"
        echo "================="
        echo ""
        gh_src_copy=""

    fi

    if [ "$(gh_is_url "$gh_src")" == "yes" ]; then
        gh_toc_load "$gh_src" | gh_toc_grab "$gh_src_copy" "$indent"
        if [ "${PIPESTATUS[0]}" != "0" ]; then
            echo "Could not load remote document."
            echo "Please check your url or network connectivity"
            exit 1
        fi
        if [ "$need_replace" = "yes" ]; then
            echo
            echo "!! '$gh_src' is not a local file"
            echo "!! Can't insert the TOC into it."
            echo
        fi
    else
        local rawhtml=$(gh_toc_md2html "$gh_src" "$skip_header")
        if [ "$rawhtml" == "XXNetworkErrorXX" ]; then
             echo "Parsing local markdown file requires access to github API"
             echo "Please make sure curl is installed and check your network connectivity"
             exit 1
        fi
        if [ "$rawhtml" == "XXRateLimitXX" ]; then
             echo "Parsing local markdown file requires access to github API"
             echo "Error: You exceeded the hourly limit. See: https://developer.github.com/v3/#rate-limiting"
             TOKEN_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/token.txt"
             echo "or place GitHub auth token here: ${TOKEN_FILE}"
             exit 1
        fi
        local toc=`echo "$rawhtml" | gh_toc_grab "$gh_src_copy" "$indent"`
        echo "$toc"
        if [ "$need_replace" = "yes" ]; then
            if grep -Fxq "<!--ts-->" $gh_src && grep -Fxq "<!--te-->" $gh_src; then
                echo "Found markers"
            else
                echo "You don't have <!--ts--> or <!--te--> in your file...exiting"
                exit 1
            fi
            local ts="<\!--ts-->"
            local te="<\!--te-->"
            local dt=`date +'%F_%H%M%S'`
            local ext=".orig.${dt}"
            local toc_path="${gh_src}.toc.${dt}"
            local toc_createdby="<!-- Created by https://github.com/ekalinin/github-markdown-toc -->"
            local toc_footer="<!-- Added by: `whoami`, at: `date` -->"
            # http://fahdshariff.blogspot.ru/2012/12/sed-mutli-line-replacement-between-two.html
            # clear old TOC
            sed -i${ext} "/${ts}/,/${te}/{//!d;}" "$gh_src"
            # create toc file
            echo "${toc}" > "${toc_path}"
            if [ "${no_footer}" != "yes" ]; then
                echo -e "\n${toc_createdby}\n${toc_footer}\n" >> "$toc_path"
            fi

            # insert toc file
            if ! sed --version > /dev/null 2>&1; then
                sed -i "" "/${ts}/r ${toc_path}" "$gh_src"
            else
                sed -i "/${ts}/r ${toc_path}" "$gh_src"
            fi
            echo
            if [ "${no_backup}" = "yes" ]; then
                rm ${toc_path} ${gh_src}${ext}
            fi
            echo "!! TOC was added into: '$gh_src'"
            if [ -z "${no_backup}" ]; then
                echo "!! Origin version of the file: '${gh_src}${ext}'"
                echo "!! TOC added into a separate file: '${toc_path}'"
        fi
            echo
        fi
    fi
}

#
# Grabber of the TOC from rendered html
#
# $1 - a source url of document.
#      It's need if TOC is generated for multiple documents.
# $2 - number of spaces used to indent.
#
gh_toc_grab() {
    common_awk_script='
                     modified_href = ""
                     split(href, chars, "")
                     for (i=1;i <= length(href); i++) {
                         c = chars[i]
                         res = ""
                         if (c == "+") {
                             res = " "
                         } else {
                             if (c == "%") {
                                 res = "\\x"
                             } else {
                                 res = c ""
                             }
                         }
                         modified_href = modified_href res
                    }
                    print sprintf("%*s", (level-1)*'"$2"', "") "* [" text "](" gh_url  modified_href ")"
                    '
    if [ `uname -s` == "OS/390" ]; then
        grepcmd="pcregrep -o"
        echoargs=""
        awkscript='{
                     level = substr($0, length($0), 1)
                     text = substr($0, match($0, /a>.*<\/h/)+2, RLENGTH-5)
                     href = substr($0, match($0, "href=\"([^\"]+)?\"")+6, RLENGTH-7)
                     '"$common_awk_script"'
                }'
    else
        grepcmd="grep -Eo"
        echoargs="-e"
        awkscript='{
                     level = substr($0, length($0), 1)
                     text = substr($0, match($0, /a>.*<\/h/)+2, RLENGTH-5)
                     href = substr($0, match($0, "href=\"[^\"]+?\"")+6, RLENGTH-7)
                     '"$common_awk_script"'
                }'
    fi
    href_regex='href=\"[^\"]+?\"'

    # if closed <h[1-6]> is on the new line, then move it on the prev line
    # for example:
    #   was: The command <code>foo1</code>
    #        </h1>
    #   became: The command <code>foo1</code></h1>
    sed -e ':a' -e 'N' -e '$!ba' -e 's/\n<\/h/<\/h/g' |

    # find strings that corresponds to template
    $grepcmd '<a.*id="user-content-[^"]*".*</h[1-6]' |

    # remove code tags
    sed 's/<code>//g' | sed 's/<\/code>//g' |

    # remove g-emoji
    sed 's/<g-emoji[^>]*[^<]*<\/g-emoji> //g' |

    # now all rows are like:
    #   <a id="user-content-..." href="..."><span ...></span></a> ... </h1
    # format result line
    #   * $0 - whole string
    #   * last element of each row: "</hN" where N in (1,2,3,...)
    echo $echoargs "$(awk -v "gh_url=$1" "$awkscript")"
}

        # perl -lpE 's/(\[[^\]]*\]\()(.*?)(\))/my ($pre, $in, $post)=($1, $2, $3) ; $in =~ s{\+}{ }g; $in =~ s{%}{\\x}g; $pre.$in.$post/ems')"

#
# Returns filename only from full path or url
#
gh_toc_get_filename() {
    echo "${1##*/}"
}

show_version() {
    echo "$gh_toc_version"
    echo
    echo "os:     `uname -s`"
    echo "arch:   `uname -m`"
    echo "kernel: `uname -r`"
    echo "shell:  `$SHELL --version`"
    echo
    for tool in curl wget grep awk sed; do
        printf "%-5s: " $tool
        if `type $tool &>/dev/null`; then
            echo `$tool --version | head -n 1`
        else
            echo "not installed"
        fi
    done
}

show_help() {
    local app_name=$(basename "$0")
    echo "GitHub TOC generator ($app_name): $gh_toc_version"
    echo ""
    echo "Usage:"
    echo "  $app_name [options] src [src]   Create TOC for a README file (url or local path)"
    echo "  $app_name -                     Create TOC for markdown from STDIN"
    echo "  $app_name --help                Show help"
    echo "  $app_name --version             Show version"
    echo ""
    echo "Options:"
    echo "  --indent <NUM>      Set indent size. Default: 3."
    echo "  --insert            Insert new TOC into original file. For local files only. Default: false."
    echo "                      See https://github.com/ekalinin/github-markdown-toc/issues/41 for details."
    echo "  --no-backup         Remove backup file. Set --insert as well. Default: false."
    echo "  --hide-footer       Do not write date & author of the last TOC update. Set --insert as well. Default: false."
    echo "  --skip-header       Hide entry of the topmost headlines. Default: false."
    echo "                      See https://github.com/ekalinin/github-markdown-toc/issues/125 for details."
    echo ""
}

#
# Options handlers
#
gh_toc_app() {
    local need_replace="no"
    local indent=3

    if [ "$1" = '--help' ] || [ $# -eq 0 ] ; then
        show_help
        return
    fi

    if [ "$1" = '--version' ]; then
        show_version
        return
    fi

    if [ "$1" = '--indent' ]; then
        indent="$2"
        shift 2
    fi

    if [ "$1" = "-" ]; then
        if [ -z "$TMPDIR" ]; then
            TMPDIR="/tmp"
        elif [ -n "$TMPDIR" -a ! -d "$TMPDIR" ]; then
            mkdir -p "$TMPDIR"
        fi
        local gh_tmp_md
        if [ `uname -s` == "OS/390" ]; then
            local timestamp=$(date +%m%d%Y%H%M%S)
            gh_tmp_md="$TMPDIR/tmp.$timestamp"
        else
            gh_tmp_md=$(mktemp $TMPDIR/tmp.XXXXXX)
        fi
        while read input; do
            echo "$input" >> "$gh_tmp_md"
        done
        gh_toc_md2html "$gh_tmp_md" | gh_toc_grab "" "$indent"
        return
    fi

    if [ "$1" = '--insert' ]; then
        need_replace="yes"
        shift
    fi

    if [ "$1" = '--no-backup' ]; then
        need_replace="yes"
        no_backup="yes"
        shift
    fi

    if [ "$1" = '--hide-footer' ]; then
        need_replace="yes"
        no_footer="yes"
        shift
    fi

    if [ "$1" = '--skip-header' ]; then
        skip_header="yes"
        shift
    fi


    for md in "$@"
    do
        echo ""
        gh_toc "$md" "$#" "$need_replace" "$no_backup" "$no_footer" "$indent" "$skip_header"
    done

    echo ""
    echo "<!-- Created by https://github.com/ekalinin/github-markdown-toc -->"
}

#
# Entry point
#
gh_toc_app "$@"
