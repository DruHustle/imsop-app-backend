FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/IMSOP.SupplyChainService/IMSOP.SupplyChainService.csproj", "src/IMSOP.SupplyChainService/"]
COPY ["src/IMSOP.Common/IMSOP.Common.csproj", "src/IMSOP.Common/"]
RUN dotnet restore "src/IMSOP.SupplyChainService/IMSOP.SupplyChainService.csproj"
COPY . .
WORKDIR "/src/src/IMSOP.SupplyChainService"
RUN dotnet build "IMSOP.SupplyChainService.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "IMSOP.SupplyChainService.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "IMSOP.SupplyChainService.dll"]
