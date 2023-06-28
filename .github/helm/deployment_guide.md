# Cluster Deployment Guide

This document provides a step-by-step guide for developers on how to deploy services in a Kubernetes cluster. The following content assumes that the reader already has a basic understanding of Kubernetes concepts and operations.

### 1. Configure Service Mesh (Optional)

In the Kubernetes cluster, we optionally use Service Mesh (like Istio and Anthos Service Mesh) to manage the network interactions of microservices. If Service Mesh is already deployed on your cluster or do not need to use the service network, you can skip this step. In this step, we assume that you are using Google Kubernetes Engine (GKE) and have already installed Anthos Service Mesh on your cluster, if you wish to use another Ingress Controller, please refer to the relevant documentation.

To configure your kubectl context to interact with your Kubernetes cluster using the gcloud tool, you need to execute the following commands:

```sh
export CLUSTER_NAME=your_cluster_name
export REGION=your_cluster_region
export PROJECT=your_project_id
gcloud container clusters get-credentials $CLUSTER_NAME --region $REGION --project $PROJECT
```

In this command, you should replace `CLUSTER_NAME`, `REGION` and `PROJECT` with the actual name, region and project id of your Kubernetes cluster. This command retrieves the access credentials for your Kubernetes cluster and automatically configures kubectl to use these credentials.

Now, to inject Service Mesh for a specific Namespace, first, set the environment variable `NAMESPACE` that should correspond to your target Kubernetes Namespace. In this example, we use `prod` as the target Namespace:

```sh
export NAMESPACE=prod
```

Then, we label the Namespace which will enable Istio to automatically inject the sidecar container for all new Pods under this Namespace:

```sh
kubectl label namespace $NAMESPACE istio-injection- istio.io/rev=asm-managed --overwrite
```

Finally, we trigger the Kubernetes Deployment restart mechanism to allow existing Pods to also obtain sidecar container injection:

```sh
kubectl rollout restart deployment -n $NAMESPACE
```

### 2. Deploying the Application

Next, we will deploy our application in the Kubernetes cluster through Helm. First, set relevant environment variables:

```sh
export NAMESPACE=prod
export RELEASE=affine-cloud-prod
export PATH=.github/helm/affine-cloud
```

- `NAMESPACE` should be consistent with the first step, indicating your target Kubernetes Namespace.
- `RELEASE` is the name of your Helm release.
- `PATH` is the location of your Helm chart in your file system.

Finally, use the `helm upgrade --install` command to deploy or upgrade your application:

```sh
helm upgrade --namespace $NAMESPACE --create-namespace --install $RELEASE $PATH
```

This command creates (if it doesn't already exist) and deploys your Helm chart in the specified Namespace. If the release already exists, it will be upgraded.

The above are the complete steps for deploying an application in a Kubernetes cluster. Make sure all prerequisites are met before deploying, and also ensure that you have the correct permissions for operations in Kubernetes.
