#!/bin/bash

# This is a script used by the devcontainer to build the project

#Enable yarn
corepack enable
corepack prepare yarn@stable --activate

# install dependencies
yarn install

### Build Native Dependencies
yarn workspace @affine/native build

### Build Infra
yarn run build:infra

### Build Plugins
yarn run build:plugins

### Build Server Dependencies
yarn workspace @affine/storage build