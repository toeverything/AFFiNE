This document explains how to start server (@affine/server) locally with Docker

> **Warning**:
>
> This document is not guaranteed to be up-to-date.
> If you find any outdated information, please feel free to open an issue or submit a PR.

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
docker exec -it affine-postgres psql -U postgres ## `affine-postgres` is the container name from the previous step
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

## Optionally, create a default user

```sh
echo "INSERT INTO \"users\"(\"id\",\"name\",\"email\",\"email_verified\",\"created_at\",\"password\") VALUES('99f3ad04-7c9b-441e-a6db-79f73aa64db9','affine','affine@affine.pro','2024-02-26 15:54:16.974','2024-02-26 15:54:16.974+00','\$argon2id\$v=19\$m=19456,t=2,p=1\$esDS3QCHRH0Kmeh87YPm5Q\$9S+jf+xzw2Hicj6nkWltvaaaXX3dQIxAFwCfFa9o38A');" | yarn workspace @affine/server prisma db execute --stdin
```

Create a default user, so you can login with the following credentials:

email: affine@affine.pro  
password: affine

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
