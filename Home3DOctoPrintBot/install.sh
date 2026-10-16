#!/usr/bin/env bash
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then echo 'Run: sudo bash install.sh'; exit 1; fi
SOURCEDIR="$(cd "$(dirname "$0")" && pwd)"
id -u octo-telegram >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin octo-telegram
install -d -o root -g root -m 0755 /opt/octo-telegram
install -o root -g root -m 0644 "$SOURCEDIR/bot.py" /opt/octo-telegram/bot.py
install -o root -g root -m 0644 "$SOURCEDIR/find_ids.py" /opt/octo-telegram/find_ids.py
install -d -o octo-telegram -g octo-telegram -m 0700 /var/lib/octo-telegram
if [[ ! -f /etc/octo-telegram.env ]]; then
  install -o root -g octo-telegram -m 0640 "$SOURCEDIR/config.env.example" /etc/octo-telegram.env
  echo 'Edit /etc/octo-telegram.env and set the credentials and your numeric Telegram ID.'
else
  echo 'Existing config preserved.'
fi
install -o root -g root -m 0644 "$SOURCEDIR/octo-telegram.service" /etc/systemd/system/octo-telegram.service
systemctl daemon-reload
systemctl enable octo-telegram.service
if grep -Eq '^(TELEGRAM_BOT_TOKEN=PUT_|OCTOPRINT_API_KEY=PUT_|ADMIN_TELEGRAM_ID=123456789)' /etc/octo-telegram.env; then
  echo 'Service NOT started: configure /etc/octo-telegram.env first.'
else
  systemctl restart octo-telegram.service
  echo 'Service restarted. Check: systemctl status octo-telegram.service'
fi