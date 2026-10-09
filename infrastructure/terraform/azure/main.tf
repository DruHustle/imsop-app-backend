provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "imsop" {
  name     = "rg-imsop-prod"
  location = "East US"
}

resource "azurerm_kubernetes_cluster" "imsop_aks" {
  name                = "aks-imsop-prod"
  location            = azurerm_resource_group.imsop.location
  resource_group_name = azurerm_resource_group.imsop.name
  dns_prefix          = "imsopaks"

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_DS2_v2"
  }

  identity {
    type = "SystemAssigned"
  }

  tags = {
    Environment = "Production"
    Project     = "IMSOP"
  }
}

resource "azurerm_postgresql_flexible_server" "imsop_db" {
  name                   = "psql-imsop-prod"
  resource_group_name    = azurerm_resource_group.imsop.name
  location               = azurerm_resource_group.imsop.location
  version                = "13"
  administrator_login    = "imsopadmin"
  administrator_password = var.db_password
  storage_mb             = 32768
  sku_name               = "GP_Standard_D2ds_v4"
}

resource "azurerm_cosmosdb_account" "imsop_cosmos" {
  name                = "cosmos-imsop-prod"
  location            = azurerm_resource_group.imsop.location
  resource_group_name = azurerm_resource_group.imsop.name
  offer_type          = "Standard"
  kind                = "MongoDB"

  capabilities {
    name = "EnableMongo"
  }

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.imsop.location
    failover_priority = 0
  }
}
