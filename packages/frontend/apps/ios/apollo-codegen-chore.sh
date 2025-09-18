#!/bin/zsh

cd "$(dirname "$0")"

set -euo pipefail

VERSION=$(grep -o 'apollo-ios", exact: "[^"]*"' "App/Packages/AffineGraphQL/Package.swift" | sed 's/.*exact: "\([^"]*\)".*/\1/')
[ -z "$VERSION" ] && { echo "❌ Failed to extract version"; exit 1; }
echo "📦 Apollo Version: $VERSION"

sed -i '' "s|apollo-ios\.git\", from: \"[^\"]*\"|apollo-ios.git\", from: \"$VERSION\"|" "App/Packages/Intelligents/Package.swift"
echo "✅ Version synced"

mkdir -p "App/Packages/AffineGraphQL/apollo-ios-cli"
curl -L "https://github.com/apollographql/apollo-ios/releases/download/$VERSION/apollo-ios-cli.tar.gz" | tar -xz -C "App/Packages/AffineGraphQL/apollo-ios-cli"
echo "✅ CLI downloaded"

CLI_BIN=$(find App/Packages/AffineGraphQL/apollo-ios-cli -type f -perm +111 -name 'apollo-ios-cli' | head -n 1)
[ -z "$CLI_BIN" ] && { echo "❌ apollo-ios-cli executable not found"; exit 1; }
echo "🔧 Using binary tool at: $CLI_BIN"

echo "🧹 Cleaning old generated files..."
rm -rf "App/Packages/AffineGraphQL/Sources"
mkdir -p "App/Packages/AffineGraphQL/Sources"

$CLI_BIN generate --path "apollo-codegen-config.json" --ignore-version-mismatch
echo "✅ Code generated"

rm -rf "App/Packages/AffineGraphQL/apollo-ios-cli"
echo "🧹 Cleaned up"



