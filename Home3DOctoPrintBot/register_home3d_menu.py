#!/usr/bin/env python3
"""Register concise Telegram commands and send the new menu to the owner."""
from pathlib import Path
import os
import runpy

env=Path("/home/octopi3d/.config/home3d-octoprint-bot.env")
for line in env.read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        k,v=line.split("=",1)
        os.environ[k]=v
module=runpy.run_path("/home/octopi3d/Home3DOctoPrintBot/bot_ui.py")
token=os.environ["TELEGRAM_BOT_TOKEN"]
admin=int(os.environ["ADMIN_TELEGRAM_ID"])
tg=module["Telegram"](token)
commands=[
    {"command":"start","description":"🏠 Главное меню"},
    {"command":"status","description":"🖨 Состояние принтера"},
    {"command":"photo","description":"📷 Фото с камеры"},
    {"command":"files","description":"📁 Файлы G-code"},
    {"command":"control","description":"🎛 Управление"},
    {"command":"help","description":"❔ Помощь"},
]
print("COMMANDS_REGISTERED="+str(tg.request("setMyCommands",{"commands":commands})))
bot=module["PrettyBot"](tg,module["OctoPrint"](
    os.environ["OCTOPRINT_URL"],os.environ["OCTOPRINT_API_KEY"]),admin)
bot.home(admin)
print("NEW_HOME_MENU_SENT=YES")