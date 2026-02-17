#!/bin/bash

# Если Railway не использует Dockerfile, он может попытаться запустить этот скрипт.
# Переходим в папку с проектом
cd Helper

# Восстанавливаем зависимости и запускаем
dotnet restore
dotnet run
