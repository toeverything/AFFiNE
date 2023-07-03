# Helm Chart Configuration

The following table lists the configurable parameters of this Helm chart and their default values.

## AFFiNE Cloud Server parameters

| Parameter                      | Description                                        | Default            |
| ------------------------------ | -------------------------------------------------- | ------------------ |
| `affineCloud.tag`              | The Docker tag of the AffineCloud image to be used | `'nightly-latest'` |
| `affineCloud.resources.cpu`    | The CPU resources allocated for AffineCloud        | `'250m'`           |
| `affineCloud.resources.memory` | The memory resources allocated for AffineCloud     | `'0.5Gi'`          |
| `affineCloud.signKey`          | The key used to sign the JWT tokens                | `'c2VjcmV0'`       |
| `affineCloud.service.type`     | The type of the Kubernetes service                 | `'ClusterIP'`      |
| `affineCloud.service.port`     | The port of the Kubernetes service                 | `'http'`           |
| `affineCloud.mail.account`     | The email account used to send emails              | `''`               |
| `affineCloud.mail.password`    | The password of the email account                  | `''`               |

## PostgreSQL parameters

| Parameter                                    | Description                                                                           | Default      |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| `postgresql.auth.username`                   | Username for the PostgreSQL database                                                  | `'affine'`   |
| `postgresql.auth.password`                   | Password for the PostgreSQL database. Please change this for production environments. | `'password'` |
| `postgresql.auth.database`                   | The name of the default database that will be created on image startup                | `'affine'`   |
| `postgresql.primary.resources.limits.cpu`    | The CPU resources allocated for the PostgreSQL primary node                           | `'500m'`     |
| `postgresql.primary.resources.limits.memory` | The memory resources allocated for the PostgreSQL primary node                        | `'0.5Gi'`    |

For more postgres parameters, please refer to: https://artifacthub.io/packages/helm/bitnami/postgresql

Please note that for the `postgresql.auth.password`, you should provide your own password for production environments. The default value is provided only for demonstration purposes.
