#!/bin/bash

for DIR in $(yarn workspaces list --json | jq -r '.location'); do
  if [ -f "$DIR/package.json" ]; then
    echo "Setting version for $DIR"
    jq ".version = \"$1\"" "$DIR"/package.json > tmp.json && mv tmp.json "$DIR"/package.json
  fi
done

git add . && git commit -m "v$1"
