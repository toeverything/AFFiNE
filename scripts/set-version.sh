#!/bin/bash

for DIR_ITEM in $(yarn workspaces list --json | jq -r '.location'); do
  DIR=$(echo -n "$DIR_ITEM" | tr -d '\r\n')
  if [ -f "$DIR/package.json" ]; then
    echo "Setting version for $DIR"
    jq ".version = \"$1\"" "$DIR"/package.json > tmp.json && mv tmp.json "$DIR"/package.json
  else
    echo "No package.json found in: $DIR"
  fi
done

update_app_version_in_helm_charts() {
  local file_path=$1
  local new_version=$2

  # Check if file exists
  if [ ! -f "$file_path" ]; then
    echo "Error: File does not exist at $file_path."
    return 1
  fi

  echo "Updating $file_path with appVersion $new_version"

  # Use sed to replace the appVersion value with the new version.
  sed -i.bak -E "s/^appVersion:[[:space:]]+[\"']?.*[\"']?$/appVersion: \"$new_version\"/" "$file_path"

  # Check if sed command succeeded
  if [ $? -ne 0 ]; then
    echo "Error: Failed to update the appVersion."
    return 1
  fi

  echo "appVersion in $file_path updated to $new_version"

  rm "$file_path".bak
}

new_version=$1

update_app_version_in_helm_charts ".github/helm/affine/Chart.yaml" "$new_version"
update_app_version_in_helm_charts ".github/helm/affine/charts/graphql/Chart.yaml" "$new_version"
update_app_version_in_helm_charts ".github/helm/affine/charts/sync/Chart.yaml" "$new_version"
