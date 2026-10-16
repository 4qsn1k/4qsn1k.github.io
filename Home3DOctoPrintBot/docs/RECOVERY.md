# Восстановление Home3DOctoPrintBot на OctoPi

## Перед началом

- Raspberry Pi с OctoPi/OctoPrint, Python 3.11+ и доступом по SSH.
- Учётная запись Linux `octopi3d` (для другой учётной записи исправьте пути в service-файле).
- Токен Telegram BotFather, отдельный ключ OctoPrint и Telegram ID владельца.
- Секреты берите из отдельного защищённого хранилища. **В репозитории их нет.**

## 1. Получить исходники

```bash
cd ~
git clone https://github.com/4qsn1k/4qsn1k.github.io.git gh-projects
cp -a gh-projects/Home3DOctoPrintBot ~/Home3DOctoPrintBot
```

Для обновления существующей копии используйте `git pull` в `~/gh-projects`, затем сравните изменения и только после этого заменяйте файлы на Pi.

## 2. Установить базовую библиотеку

```bash
sudo install -d -m 0755 /opt/octo-telegram
sudo install -m 0644 ~/Home3DOctoPrintBot/bot.py /opt/octo-telegram/bot.py
mkdir -p ~/.config/systemd/user ~/.local/state/home3d-octoprint-bot
chmod 700 ~/.local/state/home3d-octoprint-bot
```

Старый `install.sh` и `octo-telegram.service` сохранены для совместимости, но **не используйте две службы с одним токеном одновременно**.

## 3. Настроить ключи локально

```bash
cp ~/Home3DOctoPrintBot/config.user.env.example ~/.config/home3d-octoprint-bot.env
chmod 600 ~/.config/home3d-octoprint-bot.env
nano ~/.config/home3d-octoprint-bot.env
```

Установите значения `TELEGRAM_BOT_TOKEN`, `OCTOPRINT_API_KEY`, `ADMIN_TELEGRAM_ID`. Не публикуйте содержимое файла.

## 4. Проверить доступ к Telegram API

```bash
curl -4 -m 10 -o /dev/null -w '%{http_code}\n' https://api.telegram.org/
```

HTTP-ответ (например, 302) подтверждает доступ. Тайм-аут означает сетевую проблему. При необходимости используйте VPS с ограниченным SSH port-forward: установите `deploy/telegram_connect_proxy.py`, настройте две службы из `deploy/` и добавьте `HTTPS_PROXY` в секретный конфиг. Настройте отдельный SSH-ключ и ограничьте на VPS разрешённый forwarding до `api.telegram.org:443`. Сначала проверьте `curl -x http://127.0.0.1:18888 https://api.telegram.org/`. Не публикуйте адрес VPS и ключи.

## 5. Запустить пользовательскую службу

```bash
cp ~/Home3DOctoPrintBot/deploy/home3d-octoprint-bot.service ~/.config/systemd/user/home3d-octoprint-bot.service
systemctl --user daemon-reload
systemctl --user enable --now home3d-octoprint-bot.service
systemctl --user status home3d-octoprint-bot.service --no-pager
```

Для запуска после перезагрузки при отсутствии SSH-сессии один раз требуется `sudo loginctl enable-linger octopi3d`.

Если прежняя системная служба `octo-telegram.service` установлена, остановите её: `sudo systemctl disable --now octo-telegram.service`. Это предотвращает конфликт `getUpdates`.

## 6. Установить команды и проверить меню

```bash
python3 ~/Home3DOctoPrintBot/test_permissions.py
python3 ~/Home3DOctoPrintBot/test_bot_ui.py
python3 ~/Home3DOctoPrintBot/register_home3d_menu.py
```

В личном Telegram-чате проверьте `/start`, `/status`, `/photo`, `/files`. Управляющие команды проверяйте только рядом с принтером.

## 7. Важные ограничения

- Если OctoPrint сообщает `Closed`, USB-подключение принтера отсутствует; температуры недоступны. Telegram и камера могут работать независимо.
- Подтверждение запуска не заменяет физическую проверку принтера.
- Бэкап исходников в GitHub **не** заменяет отдельный зашифрованный бэкап токенов и системных настроек.
