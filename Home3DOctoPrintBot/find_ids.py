#!/usr/bin/env python3
"""One-time enrollment helper. Run before starting bot; only reads Telegram updates."""
from pathlib import Path
import os
from bot import Telegram

ENV_FILE = Path('/etc/octo-telegram.env')
if not ENV_FILE.exists():
    raise SystemExit('Config file missing; install first.')
entries = {}
for ln in ENV_FILE.read_text().splitlines():
    if '=' in ln and not ln.lstrip().startswith('#'):
        k, v = ln.split('=', 1)
        entries[k.strip()] = v.strip().strip('"').strip("'")
token = entries.get('TELEGRAM_BOT_TOKEN', '')
if not token or token.startswith('PUT_'):
    raise SystemExit('First fill TELEGRAM_BOT_TOKEN in /etc/octo-telegram.env')
print('Before running: send any message to your new bot from your account.')
print('Only private users are displayed. No credentials will be printed.')
updates = Telegram(token).request('getUpdates', {'timeout': 0, 'limit': 100}, timeout=12)
users = {}
for update in updates:
    msg = update.get('message') or {}
    chat = msg.get('chat') or {}
    sender = msg.get('from') or {}
    if chat.get('type') == 'private' and sender.get('id') == chat.get('id'):
        user_id = sender['id']
        users[user_id] = ' '.join([sender.get('first_name',''), sender.get('last_name','')]).strip()
for uid, label in users.items():
    print(f'Telegram ID: {uid}  Name: {label}')
if not users:
    print('No private messages found; send /start to your new bot from your account, then repeat.')