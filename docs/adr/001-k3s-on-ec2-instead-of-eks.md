# ADR 001: k3s on EC2 instead of EKS

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Meshdex has to run on Kubernetes in AWS (public demo, KEDA autoscaling, Helm) on a small, fixed budget. The cluster runs a handful of small services plus Postgres, Redpanda and an S3 emulator only locally; in the cloud S3 is real.

Options considered:

1. **EKS (managed Kubernetes):** AWS runs the control plane. The control plane alone costs about $0.10/h (≈ $73/month) before any worker node, load balancer or storage.
2. **k3s on a single EC2 instance:** a certified, lightweight Kubernetes distribution. Only the instance (and its disk) is paid for.
3. **ECS/Fargate:** no control-plane fee, but it isn't Kubernetes, so it would not demonstrate Helm, KEDA or Kubernetes operations at all.

## Decision

Run **k3s on one EC2 instance**, provisioned with Terraform. Locally the same Helm charts run on **kind**.

## Consequences

- **Cost:** a fixed control-plane fee of roughly $73/month is avoided, which is the biggest single cost of a small EKS setup. An AWS Budget alert is created before any other resource.
- **Portability:** k3s is CNCF-conformant, so Deployments, Services, Helm charts and KEDA `ScaledObject`s are the same as on EKS. Moving to EKS means swapping the cluster module in Terraform and adjusting values (storage class, ingress/load balancer), not rewriting manifests.
- **Operations are ours:** upgrades, control-plane backups and node security patches are not managed by AWS. Acceptable for a demo; for a team product this is the main argument for EKS.
- **No high availability:** one node is a single point of failure, and KEDA can only scale pods within that node's capacity (no cluster autoscaler). Benchmarks state this limit explicitly.
- **IAM:** without EKS there is no IRSA/Pod Identity; pods get AWS access through the instance profile, kept to least privilege (only the project's S3 buckets and ECR pull).
