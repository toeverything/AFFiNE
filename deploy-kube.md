# How to install on Kubernetes

## Required
  1. k3s (this is where this file was tested)
  2. Metal Load Balancer (on k3s) to expose the external IP on the k3s cluster (see `type: LoadBalancer`)

## Modify the manifest
Modify the following file `./deploy-kube.yml`
```
# Update the AFFINE_SERVER_EXTERNAL_URL (2x occurances)
            - name: AFFINE_SERVER_EXTERNAL_URL
              value: http://<MY_URL_OR_IPADDRESS>

# Update the DATABASE_URL (2x occurances)
            - name: DATABASE_URL
              value: postgresql://affine:<THE_DB_PASSWORD>@postgres:5432/affine

# POSTGRES_PASSWORD (3x occurances, use the same password from DATABASE_URL)
            - name: POSTGRES_PASSWORD
              value: <THE_DB_PASSWORD>

```

## Apply the manifest
Apply the modified `./deploy-kube.yml` with:
```
kubectl create ns affine
kubectl -n affine apply -f ./deploy-kube.yml
```
Notes:
1. You must use the namespace `affine` otherwise you need to fix the `REDIS_SERVER_HOST` value to use the NEW namespace name in the URL
2. The persistent volume claims are 100Mi, when using K3s, these are not backed PVC's and just leverage the underlying host filesystem(in other words if you have real PVC's you need to consider the storage size initially and over time).