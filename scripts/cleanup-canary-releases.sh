#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Clean up canary GitHub Releases (optionally their tags) in a repo.

Requires: gh (GitHub CLI) authenticated with access to the repo.

Usage:
  scripts/cleanup-canary-releases.sh [--repo OWNER/REPO] [--keep N] [--limit N]
                                    [--pattern REGEX] [--dedupe-by-commit]
                                    [--no-cleanup-tag] [--yes]

Options:
  --repo OWNER/REPO   Target repo (default: derived from git remote origin)
  --keep N            Keep the newest N canary releases (default: 30; applied after --dedupe-by-commit)
  --limit N           Max releases to fetch from GitHub (default: 500)
  --pattern REGEX     Regex matched against tagName (default: "-canary\.?")
  --dedupe-by-commit  For the same commit, keep only the newest canary release (deletes older duplicates)
  --no-cleanup-tag    Delete releases but keep remote tags (default deletes both)
  --yes               Actually delete (default: dry-run)

Examples:
  scripts/cleanup-canary-releases.sh --keep 14
  scripts/cleanup-canary-releases.sh --dedupe-by-commit --keep 30
  scripts/cleanup-canary-releases.sh --keep 0 --limit 2000 --yes
  scripts/cleanup-canary-releases.sh --repo toeverything/AFFiNE --keep 30 --yes
USAGE
}

REPO=""
KEEP=30
LIMIT=500
PATTERN='-canary\.?'
CLEANUP_TAG=1
DEDUPE_BY_COMMIT=0
YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --keep)
      KEEP="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --pattern)
      PATTERN="${2:-}"
      shift 2
      ;;
    --dedupe-by-commit)
      DEDUPE_BY_COMMIT=1
      shift 1
      ;;
    --no-cleanup-tag)
      CLEANUP_TAG=0
      shift 1
      ;;
    --yes)
      YES=1
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh not found in PATH" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found in PATH (used for safe regex quoting)" >&2
  exit 1
fi

if ! [[ "$KEEP" =~ ^[0-9]+$ ]]; then
  echo "Error: --keep must be a non-negative integer" >&2
  exit 2
fi
if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  echo "Error: --limit must be a positive integer" >&2
  exit 2
fi

if [[ -z "$REPO" ]]; then
  origin="$(git config --get remote.origin.url || true)"
  if [[ -z "$origin" ]]; then
    echo "Error: cannot derive --repo (no git remote.origin.url). Pass --repo OWNER/REPO." >&2
    exit 2
  fi
  origin="${origin%.git}"
  if [[ "$origin" =~ ^git@([^:]+):(.+)$ ]]; then
    host="${BASH_REMATCH[1]}"
    path="${BASH_REMATCH[2]}"
    REPO="${host}/${path}"
  elif [[ "$origin" =~ ^https?://([^/]+)/(.+)$ ]]; then
    host="${BASH_REMATCH[1]}"
    path="${BASH_REMATCH[2]}"
    REPO="${host}/${path}"
  else
    echo "Error: unsupported origin url: $origin" >&2
    exit 2
  fi
  if [[ "$REPO" == github.com/* ]]; then
    REPO="${REPO#github.com/}"
  fi
fi

pattern_json="$(node -e 'console.log(JSON.stringify(process.argv[1] ?? ""))' -- "$PATTERN")"

tmp_all="$(mktemp -t canary_release_tags_all.XXXXXX)"
tmp_pairs="$(mktemp -t canary_release_tag_sha_pairs.XXXXXX)"
tmp_keep="$(mktemp -t canary_release_tags_keep.XXXXXX)"
tmp_dupes="$(mktemp -t canary_release_tags_dupes.XXXXXX)"
tmp_delete="$(mktemp -t canary_release_tags_to_delete.XXXXXX)"
trap 'rm -f "$tmp_all" "$tmp_pairs" "$tmp_keep" "$tmp_dupes" "$tmp_delete"' EXIT

gh release list \
  -R "$REPO" \
  -L "$LIMIT" \
  --json tagName \
  --jq ".[] | select(.tagName | test(${pattern_json})) | .tagName" >"$tmp_all"

total="$(wc -l <"$tmp_all" | tr -d ' ')"
if [[ "$total" -eq 0 ]]; then
  echo "No releases matched pattern '$PATTERN' in $REPO."
  exit 0
fi

if [[ "$total" -le "$KEEP" ]] && [[ "$DEDUPE_BY_COMMIT" -ne 1 ]]; then
  echo "Found $total matching releases in $REPO; keep=$KEEP => nothing to delete."
  exit 0
fi

if [[ "$DEDUPE_BY_COMMIT" -eq 1 ]]; then
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    sha="$(
      gh api "repos/$REPO/commits/$tag" --jq '.sha' 2>/dev/null || true
    )"
    if [[ -z "$sha" ]]; then
      echo "Warning: failed to resolve commit for tag $tag; keeping it to be safe." >&2
      sha="UNKNOWN:$tag"
    fi
    printf '%s\t%s\n' "$tag" "$sha" >>"$tmp_pairs"
  done <"$tmp_all"

  awk -F'\t' -v keep_n="$KEEP" -v keep_file="$tmp_keep" -v dupes_file="$tmp_dupes" -v delete_file="$tmp_delete" '
    {
      tag=$1; sha=$2
      if (!(sha in seen)) {
        seen[sha]=1
        uniq++
        if (uniq <= keep_n) print tag >> keep_file
        else print tag >> delete_file
      } else {
        print tag >> dupes_file
        print tag >> delete_file
      }
    }
  ' "$tmp_pairs"
else
  awk -v keep_n="$KEEP" -v keep_file="$tmp_keep" -v delete_file="$tmp_delete" '
    NR <= keep_n { print >> keep_file; next }
    { print >> delete_file }
  ' "$tmp_all"
  : >"$tmp_dupes"
fi

delete_count="$(wc -l <"$tmp_delete" | tr -d ' ')"
echo "Repo: $REPO"
echo "Pattern: $PATTERN"
echo "Matched canary releases: $total"
echo "Keeping newest: $KEEP"
if [[ "$DEDUPE_BY_COMMIT" -eq 1 ]]; then
  dupes_count="$(wc -l <"$tmp_dupes" | tr -d ' ')"
  echo "Deduped by commit: yes (duplicate releases to remove: $dupes_count)"
fi
echo "Will delete: $delete_count"
if [[ "$delete_count" -eq 0 ]]; then
  echo "Nothing to delete."
  exit 0
fi
echo
echo "Tags to delete (newest to oldest):"
cat "$tmp_delete"
echo

if [[ "$YES" -ne 1 ]]; then
  echo "Dry-run only. Re-run with --yes to actually delete."
  exit 0
fi

while IFS= read -r tag; do
  [[ -n "$tag" ]] || continue
  echo "Deleting release: $tag"
  if [[ "$CLEANUP_TAG" -eq 1 ]]; then
    gh release delete "$tag" -R "$REPO" --yes --cleanup-tag
  else
    gh release delete "$tag" -R "$REPO" --yes
  fi
done <"$tmp_delete"

echo "Done."
