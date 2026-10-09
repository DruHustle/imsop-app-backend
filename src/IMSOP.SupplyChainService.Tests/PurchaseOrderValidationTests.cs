using System.ComponentModel.DataAnnotations;
using IMSOP.SupplyChainService.Entities;
using Xunit;

namespace IMSOP.SupplyChainService.Tests;

public class PurchaseOrderValidationTests
{
    [Fact]
    public void ValidOrder_PassesDataAnnotationValidation()
    {
        var order = new PurchaseOrder
        {
            OrganizationId = Guid.NewGuid(),
            SupplierId = Guid.NewGuid(),
            OrderNumber = "PO-1001",
            TotalAmount = 125.50m
        };

        Assert.Empty(Validate(order));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void NonPositiveTotal_FailsValidation(decimal total)
    {
        var order = new PurchaseOrder
        {
            OrganizationId = Guid.NewGuid(),
            SupplierId = Guid.NewGuid(),
            OrderNumber = "PO-1001",
            TotalAmount = total
        };

        Assert.Contains(Validate(order), result =>
            result.MemberNames.Contains(nameof(PurchaseOrder.TotalAmount)));
    }

    [Fact]
    public void MissingOrderNumber_FailsValidation()
    {
        var order = new PurchaseOrder
        {
            OrganizationId = Guid.NewGuid(),
            SupplierId = Guid.NewGuid(),
            TotalAmount = 1m
        };

        Assert.Contains(Validate(order), result =>
            result.MemberNames.Contains(nameof(PurchaseOrder.OrderNumber)));
    }

    private static IReadOnlyCollection<ValidationResult> Validate(PurchaseOrder order)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(order, new ValidationContext(order), results, true);
        return results;
    }
}
