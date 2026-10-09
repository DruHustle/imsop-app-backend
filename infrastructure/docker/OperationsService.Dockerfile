FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=10000
EXPOSE 10000

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/IMSOP.OperationsService/IMSOP.OperationsService.csproj", "src/IMSOP.OperationsService/"]
COPY ["src/IMSOP.Common/IMSOP.Common.csproj", "src/IMSOP.Common/"]
RUN dotnet restore "src/IMSOP.OperationsService/IMSOP.OperationsService.csproj"
COPY . .
WORKDIR "/src/src/IMSOP.OperationsService"
RUN dotnet build "IMSOP.OperationsService.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "IMSOP.OperationsService.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
USER app
ENTRYPOINT ["dotnet", "IMSOP.OperationsService.dll"]
