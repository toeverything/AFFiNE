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

```
DATABASE_URL="postgresql://affine:affine@localhost:5432/affine"
NEXTAUTH_URL="http://localhost:8080/"
```

You may need additional env for auth login. You may want to put your own one if you are not part of the AFFiNE team

For email login & password, please refer to https://nodemailer.com/usage/using-gmail/

```
OAUTH_EMAIL_SENDER=
OAUTH_EMAIL_LOGIN=
OAUTH_EMAIL_PASSWORD=
OAUTH_GOOGLE_ENABLED="true"
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
```

## Prepare prisma

```
yarn workspace @affine/server prisma db push
```

Note, you may need to do it again if db schema changed.

### Enable prisma studio

```
yarn workspace @affine/server prisma studio
```

## Build native packages (you need to setup rust toolchain first)

```
# build native
yarn workspace @affine/storage build
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
