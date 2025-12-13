This document explains how to start server (@affine/server) locally with Docker

> **Warning**:
>
> This document is not guaranteed to be up-to-date.
> If you find any outdated information, please feel free to open an issue or submit a PR.

## Run required dev services in docker compose

Running yarn's server package (@affine/server) requires some dev services to be running, i.e.:

- postgres
- redis
- mailhog

You can run these services in docker compose by running the following command:

```sh
cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml
cp ./.docker/dev/.env.example ./.docker/dev/.env

docker compose -f ./.docker/dev/compose.yml up
```

### Notify

> Starting from AFFiNE 0.20, compose.yml includes a breaking change: the default database image has switched from `postgres:16` to `pgvector/pgvector:pg16`. If you were previously using another major version of Postgres, please change the number after `pgvector/pgvector:pg` to the major version you are using.

## Build native packages (you need to setup rust toolchain first)

Server also requires native packages to be built, you can build them by running the following command:

```sh
# build native
yarn affine @affine/server-native build
```

## Prepare dev environment

```sh
# uncomment all env variables here
cp packages/backend/server/.env.example packages/backend/server/.env

# everytime there are new migrations, init command should runned again
yarn affine server init
```

## Start server

```sh
# at project root
yarn affine server dev
```

when server started, it will created a default user and a pro user for testing:

### default user

Workspace members up to 3

- email: dev@affine.pro
- name: Dev User
- password: dev

### pro user

Workspace members up to 10

- email: pro@affine.pro
- name: Pro User
- password: pro

### team user

Include a default `Team Workspace` and the members up to 10

- email: team@affine.pro
- name: Team User
- password: team

## Start frontend

```sh
# at project root
yarn dev
```

You can login with the user (dev@affine.pro / dev) above to test the server.

## Done

Now you should be able to start developing affine with server enabled.

## Bonus

### Enable prisma studio (Database GUI)

```sh
# available at http://localhost:5555
yarn affine server prisma studio
```

### Seed the db

```sh
yarn affine server seed -h
```
