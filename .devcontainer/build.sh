#!/bin/bash
# This is a script used by the devcontainer to build the project

#Enable yarn
corepack enable
corepack prepare yarn@stable --activate

# install dependencies
yarn install

# Build Server Dependencies
yarn workspace @affine/server-native build

# Create database
yarn workspace @affine/server prisma db push
