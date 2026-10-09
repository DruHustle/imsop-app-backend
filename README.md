# IMSOP - Intelligent Multi-Cloud Supply Chain & Operations Platform

IMSOP is an enterprise-grade, microservices-based backend solution designed for high-performance supply chain management and operations. Built on **.NET 8** and optimized for **Azure Free Tier** services, it leverages a robust architecture to ensure scalability, security, and real-time responsiveness.

## 🏗️ Architecture Overview

The system follows a **Microservices Architecture** with a clear separation of concerns:

*   **API Gateway Layer**: Handles GraphQL (HotChocolate) and RESTful requests, providing a unified entry point for web and mobile clients.
*   **Core Services**:
    *   **SupplyChainService**: Manages procurement, inventory, and logistics using Domain-Driven Design (DDD) principles.
    *   **OperationsService**: Orchestrates workflow automation and asynchronous task management.
    *   **IdentityService**: Integrated with Microsoft Entra ID (Azure AD) for secure, role-based access control (RBAC).
*   **Asynchronous Communication**: Utilizes **Azure Service Bus** for decoupling services and ensuring reliable message processing.
*   **Real-time Updates**: Integrated **SignalR** for pushing live status updates (e.g., shipment tracking) to clients.

## 🛠️ Tech Stack

*   **Framework**: .NET 8 (C#)
*   **Database**: Aiven PostgreSQL (Primary), Aiven Redis (Caching), Aiven Elasticsearch (Search)
*   **Cloud Platform**: Azure (App Services, Functions, Logic Apps, Key Vault, Monitor)
*   **Infrastructure as Code (IaC)**: Terraform & Azure Bicep
*   **Containerization**: Docker & Docker Compose
*   **CI/CD**: GitHub Actions & Azure DevOps Pipelines
*   **Security**: OAuth 2.0, JWT, Managed Identities, and Azure Key Vault

## 🚀 Key Features

*   **Multi-Tenancy**: Built-in support for organizational isolation and subscription-based access.
*   **Event-Driven Design**: Scalable background processing for order fulfillment and reporting.
*   **Comprehensive Monitoring**: Full observability via Azure Monitor and Application Insights.
*   **Secure API Design**: Adheres to S.O.L.I.D. principles and secure coding standards.

## 📂 Repository Structure

*   `/src`: .NET 8 Solution and Microservices source code.
*   `/server`: Node.js API used by the React frontend for authentication, logistics ingestion, telemetry, and operations data.
*   `/infrastructure`: Terraform and Bicep templates for automated Azure provisioning.
*   `/infrastructure/render`: Single production image packaging for Render's **Existing Image** deployment flow.
*   `/setup-dev-db.sh` and `/setup-test-db.sh`: Local MySQL database setup.
*   `/pipelines`: CI/CD workflow definitions for automated testing and deployment.
*   `/docs`: Detailed deployment guides, API flows, and architectural diagrams.

## 📖 Getting Started

Refer to the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md) for step-by-step instructions on setting up the infrastructure and deploying the services to Azure.

## Current documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Database guide and diagrams](./docs/DATABASE.md)
- [API reference](./docs/API.md)
- [Deployment and rollback](./docs/DEPLOYMENT.md)
- [Render image deployment](./docs/RENDER_IMAGE_DEPLOYMENT.md)
- [Test strategy](./docs/TESTING.md)
