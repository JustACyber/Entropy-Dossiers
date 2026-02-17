#!/bin/bash

echo "--- DEBUG: Checking directories ---"
ls -la
echo "--- DEBUG: Checking out/ directory ---"
ls -la out/ || echo "Directory 'out' does not exist!"

# Если файла нет, скрипт упадет, но мы увидим логи выше
if [ -f "out/Bot" ]; then
    echo "--- Found Binary, granting permissions... ---"
    chmod +x out/Bot
    echo "--- Launching Bot... ---"
    exec ./out/Bot
else
    echo "ERROR: Binary 'out/Bot' was not found. Build likely failed."
    exit 1
fi
