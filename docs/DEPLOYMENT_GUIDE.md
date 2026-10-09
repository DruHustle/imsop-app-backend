# IMSOP Backend Deployment Guide

This document provides step-by-step instructions for setting up and deploying the IMSOP backend microservices. Container images are stored in GitHub Container Registry (GHCR); Azure remains an optional runtime target.

## Prerequisites
- **Azure Account**: A free Azure account.
- **.NET 8 SDK**: Installed on your local machine.
- **Azure CLI**: For infrastructure management.
- **Terraform**: For Infrastructure as Code.
- **Docker**: For containerization.

## Step 1: Infrastructure Setup (IaC)
1. Navigate to `infrastructure/terraform`.
2. Update `main.tf` with your Azure Tenant ID.
3. Run the following commands:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```
This will provision the Resource Group, App Service Plan (Free Tier), App Service, Service Bus, and Key Vault.

## Step 2: Database Setup (Aiven)
1. Sign up for a free account at [Aiven.io](https://aiven.io).
2. Create a free **PostgreSQL** instance.
3. Create a free **Redis** instance.
4. Obtain the connection strings and add them to Azure Key Vault or App Service Configuration.

## Step 3: Application Configuration
Update the `appsettings.json` in each service or use Azure App Service Environment Variables:
- `ConnectionStrings:DefaultConnection`: PostgreSQL connection string.
- `ServiceBus:ConnectionString`: Azure Service Bus connection string.
- `Redis:ConnectionString`: Aiven Redis connection string.

## Step 4: Containerization & Deployment
1. Build the Docker images:
   ```bash
   docker build -t imsop-supplychain -f infrastructure/docker/SupplyChainService.Dockerfile .
   ```
2. Push to `main`. GitHub Actions builds and publishes all three .NET service images to GHCR with both the commit SHA and `latest` tags:
   - `ghcr.io/druhustle/imsop-gateway`
   - `ghcr.io/druhustle/imsop-operationsservice`
   - `ghcr.io/druhustle/imsop-supplychainservice`

GitHub Actions authenticates with the built-in `GITHUB_TOKEN`; no Azure Container Registry credentials are required. Deploy immutable SHA tags or digests in production.

## Step 5: CI/CD Setup
1. Use `.github/workflows/ci-cd.yml` to test, build, and publish the service images.
2. Configure the following secrets only when deploying the published images to Azure App Service:
   - `AZURE_CREDENTIALS`
   - `AZURE_WEBAPP_NAME`
   - `AZURE_WEBAPP_PUBLISH_PROFILE`

## Monitoring
- Access **Azure Monitor** and **Application Insights** in the Azure Portal to track performance and logs.
- Use **Log Analytics** for deep-dive troubleshooting.
