This document explains how to start server (@affine/server) locally with Docker

## Run postgresql in docker

```
docker pull postgres
docker run --rm --name affine-postgres -e POSTGRES_PASSWORD=affine -p 5432:5432 -v ~/Documents/postgres:/var/lib/postgresql/data postgres
```

### Optionally, use a dedicated volume

```
docker volume create affine-postgres
docker run --rm --name affine-postgres -e POSTGRES_PASSWORD=affine -p 5432:5432 -v affine-postgres:/var/lib/postgresql/data postgres
```

### mailhog (for local testing)

```
docker run --rm --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

## prepare db

```
docker ps
docker exec -it CONTAINER_ID psql -U postgres ## change container_id
```

### in the terminal, following the example to user & table

```
psql (15.3 (Debian 15.3-1.pgdg120+1))
Type "help" for help.

postgres=# CREATE USER affine WITH PASSWORD 'affine';
CREATE ROLE
postgres=# ALTER USER affine WITH SUPERUSER;
ALTER ROLE
postgres=# CREATE DATABASE affine;
CREATE DATABASE
postgres=# \du
                                   List of roles
 Role name |                         Attributes                         | Member of
-----------+------------------------------------------------------------+-----------
 affine    | Superuser                                                  | {}
 postgres  | Superuser, Create role, Create DB, Replication, Bypass RLS | {}
```

### Set the following config to `packages/backend/server/.env`

In the following setup, we assume you have postgres server running at localhost:5432 and mailhog running at localhost:1025.

When logging in via email, you will see the mail arriving at localhost:8025 in a browser.

```
DATABASE_URL="postgresql://affine:affine@localhost:5432/affine"
MAILER_SENDER="noreply@toeverything.info"
MAILER_USER="auth"
MAILER_PASSWORD="auth"
MAILER_HOST="localhost"
MAILER_PORT="1025"
```

## Prepare prisma

```
yarn workspace @affine/server prisma db push
yarn workspace @affine/server data-migration run
```

Note, you may need to do it again if db schema changed.

### Enable prisma studio

```
yarn workspace @affine/server prisma studio
```

## Build native packages (you need to setup rust toolchain first)

```
# build native
yarn workspace @affine/server-native build
yarn workspace @affine/native build
```

## start server

```
yarn workspace @affine/server dev
```

## start core (web)

```
yarn dev
```

## Done

Now you should be able to start developing affine with server enabled.
