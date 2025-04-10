#!/bin/bash
# This is a script used by the devcontainer to build the project

# install dependencies
yarn install

# Build Server Dependencies
yarn affine @affine/server-native build

# Create database
yarn affine @affine/server prisma migrate reset -f
