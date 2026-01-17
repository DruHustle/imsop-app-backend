provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "imsop" {
  name     = "rg-imsop-prod"
  location = "East US"
}

# Azure App Service Plan (Free Tier F1)
resource "azurerm_service_plan" "imsop" {
  name                = "asp-imsop-free"
  resource_group_name = azurerm_resource_group.imsop.name
  location            = azurerm_resource_group.imsop.location
  os_type             = "Linux"
  sku_name            = "F1"
}

# Azure App Service for SupplyChainService
resource "azurerm_linux_web_app" "supply_chain" {
  name                = "app-imsop-supplychain"
  resource_group_name = azurerm_resource_group.imsop.name
  location            = azurerm_service_plan.imsop.location
  service_plan_id     = azurerm_service_plan.imsop.id

  site_config {
    application_stack {
      dotnet_version = "8.0"
    }
  }
}

# Azure Service Bus (Basic Tier for Free/Low Cost)
resource "azurerm_servicebus_namespace" "imsop" {
  name                = "sb-imsop-prod"
  location            = azurerm_resource_group.imsop.location
  resource_group_name = azurerm_resource_group.imsop.name
  sku                 = "Basic"
}

resource "azurerm_servicebus_queue" "orders" {
  name         = "order-processing"
  namespace_id = azurerm_servicebus_namespace.imsop.id
}

# Azure Key Vault
resource "azurerm_key_vault" "imsop" {
  name                        = "kv-imsop-prod"
  location                    = azurerm_resource_group.imsop.location
  resource_group_name         = azurerm_resource_group.imsop.name
  enabled_for_disk_encryption = true
  tenant_id                   = "YOUR_TENANT_ID"
  soft_delete_retention_days  = 7
  purge_protection_enabled    = false

  sku_name = "standard"
}
