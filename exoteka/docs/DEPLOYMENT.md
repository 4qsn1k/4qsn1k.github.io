# Развёртывание и восстановление

Нужно: Linux, Docker Compose и токен бота из BotFather.

```bash
cp .env.example .env
# Введите BOT_TOKEN в .env
chmod 600 .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=50
```

Каждый новый пользователь открывает @ExoTekaBot и отправляет `/start`: может создать личную коллекцию или присоединиться к семейной по ссылке. Для нового сервера не нужны `OWNER_TELEGRAM_ID` и `ADDITIONAL_USER_IDS`. Они используются только при однократной миграции прежнего единственного владельца и его помощников.

## Обновление

Сохраните резервную копию рабочей SQLite-базы перед обновлением кода.

```bash
mkdir -p ../exoteka-private-backups
python3 - <<'PY'
import sqlite3
src=sqlite3.connect('data/pets.sqlite3')
dst=sqlite3.connect('../exoteka-private-backups/pets.sqlite3')
src.backup(dst)
dst.close()
src.close()
print('SQLite backup completed')
PY
docker compose up -d --build
```

Том `data/` сохраняется между перезапусками. При восстановлении остановите контейнер, замените SQLite проверенной копией, восстановите личный `.env` и перезапустите Compose. **Не загружайте базу и токен в GitHub.**

## Тесты

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python tests/test_smoke.py
```

## Доступ

Каждый участник работает только с выбранной коллекцией. Одноразовая ссылка действует 48 часов. Приглашённый может редактировать карточки и кормления, но не может приглашать других или удалять владельца. Владелец может отключить участника через «Семья и коллекции». Любой участник может покинуть семейную коллекцию.

При ошибке Native Rich Messages бот автоматически переключается на классический Telegram UI. Команда `/classic` позволяет переключить режим вручную, `/rich` — вернуть.
