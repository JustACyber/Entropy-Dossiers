#!/bin/bash

echo "--- DEBUG: FULL FILE LISTING ---"
# Эта команда покажет нам ВСЕ файлы во всех папках, чтобы мы нашли, куда делся Bot
ls -R
echo "--------------------------------"

# Ищем скомпилированный файл в папке published (куда мы его положили на этапе Build)
if [ -f "published/Bot" ]; then
    echo "--- Binary found in 'published/Bot'. Starting... ---"
    chmod +x published/Bot
    exec ./published/Bot
else
    echo "CRITICAL ERROR: Binary not found in 'published/Bot'!"
    # Если файла нет там, пробуем найти его где угодно (fallback)
    FOUND_BIN=$(find . -name "Bot" -type f | head -n 1)
    if [ -n "$FOUND_BIN" ]; then
        echo "--- Found binary at $FOUND_BIN. Starting fallback... ---"
        chmod +x "$FOUND_BIN"
        exec "$FOUND_BIN"
    else
        echo "ERROR: Could not find 'Bot' binary anywhere."
        exit 1
    fi
fi
