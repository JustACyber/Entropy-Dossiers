# 1. Этап сборки (Build Stage)
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Копируем файл проекта. 
# Контекст сборки - папка Bot, поэтому путь Helper/Helper.csproj
COPY ["Helper/Helper.csproj", "Helper/"]
RUN dotnet restore "Helper/Helper.csproj"

# Копируем весь остальной код из папки Bot внутрь образа
COPY . .

# Переходим в папку с кодом и собираем
WORKDIR "/src/Helper"
# Собираем самодостаточный (self-contained) бинарник для Linux x64
RUN dotnet publish "Helper.csproj" -c Release -o /app/publish -r linux-x64 --self-contained true /p:AssemblyName=Bot

# 2. Этап запуска (Runtime Stage)
# Используем легкий образ runtime-deps (только зависимости Linux, без .NET SDK, так как он вшит в бинарник)
FROM mcr.microsoft.com/dotnet/runtime-deps:8.0 AS final
WORKDIR /app

# Забираем готовый бинарник из первого этапа
COPY --from=build /app/publish .

# Выдаем права на запуск
RUN chmod +x Bot

# Команда запуска
ENTRYPOINT ["./Bot"]
