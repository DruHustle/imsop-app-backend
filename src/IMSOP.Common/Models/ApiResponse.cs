using System;
using System.Collections.Generic;

namespace IMSOP.Common.Models
{
    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public T? Data { get; set; }
        public ApiError? Error { get; set; }
        public ApiMeta Meta { get; set; } = new ApiMeta();
    }

    public class ApiError
    {
        public string Code { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public List<ApiErrorDetail>? Details { get; set; }
    }

    public class ApiErrorDetail
    {
        public string Field { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }

    public class ApiMeta
    {
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string Version { get; set; } = "1.0";
        public string? RequestId { get; set; }
    }

    public class PaginatedResponse<T> : ApiResponse<List<T>>
    {
        public PaginationInfo Pagination { get; set; } = new PaginationInfo();
    }

    public class PaginationInfo
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int Total { get; set; }
        public int TotalPages { get; set; }
        public bool HasNextPage { get; set; }
        public bool HasPreviousPage { get; set; }
    }
}
