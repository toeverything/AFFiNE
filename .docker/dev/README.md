# Dev containers

## Develop with domain

> MacOs only, OrbStack only

### 1. Generate and install Root CA

```bash
# the root ca file will be located at `./.docker/dev/certs/ca`
yarn affine cert --install
```

### 2. Generate domain certs

```bash
# certificates will be located at `./.docker/dev/certs/${domain}`
yarn affine cert --domain dev.affine.fail
```

### 3. Enable dns and nginx service in compose.yml

### 4. Add custom dns server

```bash
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/dev.affine.fail
```
