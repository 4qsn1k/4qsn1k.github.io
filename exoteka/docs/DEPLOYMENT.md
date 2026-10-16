# Развёртывание, обновление и восстановление

1. Установите Docker и Docker Compose на Linux-сервер.
2. Перенесите папку `exoteka/` на сервер.
3. Создайте `.env` из `.env.example`. Заполните `BOT_TOKEN`, `ACTIVATION_CODE`, часовой пояс, при необходимости `OWNER_TELEGRAM_ID` и `ADDITIONAL_USER_IDS`.
4. Выполните:

```bash
chmod 600 .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=50
```

При первом запуске создаётся база `data/pets.sqlite3`. Если основной владелец не задан через переменную, используйте команду бота `/activate КОД`. При обновлении исходников запускайте `docker compose up -d --build` повторно; том `data/` сохраняется.

## Резервная копия

Перед обновлением сделайте **согласованную копию** базы SQLite:

```bash
mkdir -p ../exoteka-private-backups
python3 - <<'PY'
import sqlite3
src = sqlite3.connect('data/pets.sqlite3')
dst = sqlite3.connect('../exoteka-private-backups/pets.sqlite3')
src.backup(dst)
dst.close()
src.close()
print('Backup complete')
PY
```

Файл конфигурации `.env` и копию данных храните отдельно, в защищённом месте. **Не сохраняйте их в публичном GitHub.** Для восстановления остановите контейнер, замените базу проверенной резервной копией и повторно запустите Compose.

## Проверки

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python tests/test_smoke.py
```

При ошибке Rich Messages бот автоматически использует обычное сообщение. Резервный интерфейс доступен командой `/classic`, возврат к Rich — `/rich`.

GitHub хранит исходный код и историю изменений, но не заменяет резервные копии данных.
