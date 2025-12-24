#!/bin/bash

# Script to update code signing settings in iOS project for CI environment
# Updates project.pbxproj to use Apple Distribution certificate and team settings

set -e  # Exit immediately if a command exits with a non-zero status

# Define target values
TARGET_IDENTITY="Apple Distribution: TOEVERYTHING PTE. LTD. (73YMMDVT2M)"
TARGET_SIGN_STYLE="Manual"
TARGET_TEAM="73YMMDVT2M"
TARGET_PROVISIONING_PROFILE="AppStore app.affine.pro"

# Get script directory and build absolute path to project file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PBXPROJ_FILE="$SCRIPT_DIR/App/App.xcodeproj/project.pbxproj"

# Check if file exists
if [ ! -f "$PBXPROJ_FILE" ]; then
    echo "❌ Error: project.pbxproj file not found: $PBXPROJ_FILE"
    exit 1
fi

echo "🔍 Found project file: $PBXPROJ_FILE"

# Display current settings
echo "📋 Current code signing settings:"
echo "--- CODE_SIGN_IDENTITY ---"
grep -n "CODE_SIGN_IDENTITY" "$PBXPROJ_FILE" || echo "No CODE_SIGN_IDENTITY settings found"
echo "--- CODE_SIGN_STYLE ---"
grep -n "CODE_SIGN_STYLE" "$PBXPROJ_FILE" || echo "No CODE_SIGN_STYLE settings found"
echo "--- DEVELOPMENT_TEAM ---"
grep -n "DEVELOPMENT_TEAM" "$PBXPROJ_FILE" || echo "No DEVELOPMENT_TEAM settings found"
echo "--- PROVISIONING_PROFILE_SPECIFIER ---"
grep -n "PROVISIONING_PROFILE_SPECIFIER" "$PBXPROJ_FILE" || echo "No PROVISIONING_PROFILE_SPECIFIER settings found"

# Replace CODE_SIGN_IDENTITY settings
echo ""
echo "🔄 Replacing CODE_SIGN_IDENTITY..."
sed -i.tmp 's/CODE_SIGN_IDENTITY = "[^"]*";/CODE_SIGN_IDENTITY = "'"$TARGET_IDENTITY"'";/g' "$PBXPROJ_FILE"

# Replace CODE_SIGN_STYLE settings
echo "🔄 Replacing CODE_SIGN_STYLE..."
sed -i.tmp 's/CODE_SIGN_STYLE = [^;]*;/CODE_SIGN_STYLE = '"$TARGET_SIGN_STYLE"';/g' "$PBXPROJ_FILE"

# Replace DEVELOPMENT_TEAM settings
echo "🔄 Replacing DEVELOPMENT_TEAM..."
sed -i.tmp 's/DEVELOPMENT_TEAM = [^;]*;/DEVELOPMENT_TEAM = '"$TARGET_TEAM"';/g' "$PBXPROJ_FILE"

# Replace PROVISIONING_PROFILE_SPECIFIER settings
echo "🔄 Replacing PROVISIONING_PROFILE_SPECIFIER..."
sed -i.tmp 's/PROVISIONING_PROFILE_SPECIFIER = "[^"]*";/PROVISIONING_PROFILE_SPECIFIER = "'"$TARGET_PROVISIONING_PROFILE"'";/g' "$PBXPROJ_FILE"

# Remove temporary file
rm -f "${PBXPROJ_FILE}.tmp"

# Verify replacement results
echo ""
echo "✅ Replacement completed! New code signing settings:"
echo "--- CODE_SIGN_IDENTITY ---"
grep -n "CODE_SIGN_IDENTITY" "$PBXPROJ_FILE"
echo "--- CODE_SIGN_STYLE ---"
grep -n "CODE_SIGN_STYLE" "$PBXPROJ_FILE"
echo "--- DEVELOPMENT_TEAM ---"
grep -n "DEVELOPMENT_TEAM" "$PBXPROJ_FILE"
echo "--- PROVISIONING_PROFILE_SPECIFIER ---"
grep -n "PROVISIONING_PROFILE_SPECIFIER" "$PBXPROJ_FILE"

# Count replacements
IDENTITY_COUNT=$(grep -c "CODE_SIGN_IDENTITY.*$TARGET_IDENTITY" "$PBXPROJ_FILE")
STYLE_COUNT=$(grep -c "CODE_SIGN_STYLE.*$TARGET_SIGN_STYLE" "$PBXPROJ_FILE")
TEAM_COUNT=$(grep -c "DEVELOPMENT_TEAM.*$TARGET_TEAM" "$PBXPROJ_FILE")
PROVISIONING_COUNT=$(grep -c "PROVISIONING_PROFILE_SPECIFIER.*$TARGET_PROVISIONING_PROFILE" "$PBXPROJ_FILE")

echo ""
echo "📊 Replacement summary:"
echo "  - CODE_SIGN_IDENTITY: $IDENTITY_COUNT replacements"
echo "  - CODE_SIGN_STYLE: $STYLE_COUNT replacements"
echo "  - DEVELOPMENT_TEAM: $TEAM_COUNT replacements"
echo "  - PROVISIONING_PROFILE_SPECIFIER: $PROVISIONING_COUNT replacements"

echo ""
echo "🎉 Script execution completed successfully!"
