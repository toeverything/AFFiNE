#!/bin/bash
# This is a script used by the devcontainer to build the project

#Enable yarn
corepack enable
corepack prepare yarn@stable --activate

# install dependencies
yarn install

# Create database
yarn workspace @affine/server prisma db push