# IMSOP Backend Deployment Guide

This document provides step-by-step instructions for setting up and deploying the IMSOP backend microservices to Azure using free tier services.

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
2. Push to Azure Container Registry (if using) or deploy directly to App Service via GitHub Actions.

## Step 5: CI/CD Setup
1. Use the provided GitHub Actions workflows in `pipelines/github-actions`.
2. Configure the following secrets in your GitHub repository:
   - `AZURE_CREDENTIALS`
   - `AZURE_WEBAPP_NAME`
   - `AZURE_WEBAPP_PUBLISH_PROFILE`

## Monitoring
- Access **Azure Monitor** and **Application Insights** in the Azure Portal to track performance and logs.
- Use **Log Analytics** for deep-dive troubleshooting.
