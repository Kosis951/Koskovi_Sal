#!/bin/sh
# Xcode Cloud runs this after cloning: the Xcode project is generated from
# project.yml (it is not in git). Build numbers continue above GitHub's.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH/ios"

if [ -n "$CI_BUILD_NUMBER" ]; then
  sed -i '' "s/CURRENT_PROJECT_VERSION: \"1\"/CURRENT_PROJECT_VERSION: \"$((1000 + CI_BUILD_NUMBER))\"/" project.yml
fi

brew install xcodegen
xcodegen generate
