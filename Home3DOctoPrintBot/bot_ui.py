#!/usr/bin/env python3
"""Inline Telegram UI for the existing one-owner OctoPrint backend."""
import html
import json
import logging
import os
import sys
import time
import urllib.parse

sys.path.insert(0, "/opt/octo-telegram")
from bot import Bot as BaseBot, Telegram, OctoPrint, ApiError, required_env
from bot import http_request, multipart, MAX_GCODE_BYTES, GCODE_EXT

LOG = logging.getLogger("home3d-ui")

def button(label, value):
    return {"text": label, "callback_data": value}

HOME_KEYS = [
    [button("🖨 Состояние", "menu:status"), button("📷 Камера", "menu:photo")],
    [button("📁 G-code", "menu:files"), button("🎛 Управление", "menu:control")],
    [button("❔ Помощь", "menu:help")],
]
BACK = [[button("🏠 Главное меню", "menu:home")]]

def board(rows):
    return {"inline_keyboard": rows}

def esc(v):
    return html.escape(str(v), quote=False)

def duration(seconds):
    if not isinstance(seconds, (int, float)) or seconds < 0:
        return "—"
    seconds = int(seconds)
    h, m = divmod(seconds // 60, 60)
    return f"{h} ч {m} мин" if h else f"{m} мин"

class PrettyBot(BaseBot):
    def render(self, chat, text, rows, edit_id=None):
        payload = {"chat_id": chat, "text": text[:3950], "parse_mode": "HTML",
                   "reply_markup": board(rows)}
        if edit_id is not None:
            try:
                self.tg.request("editMessageText", dict(payload, message_id=edit_id), timeout=18)
                return
            except ApiError:
                pass
        self.tg.request("sendMessage", payload)

    def home(self, chat, edit=None):
        self.render(chat, "🖨 <b>Home3D · Ender-3 S1 Pro</b>\n\n"
                    "Управление 3D-принтером с телефона.\n"
                    "Выбери нужный раздел 👇", HOME_KEYS, edit)

    def status_text(self):
        j = self.op.get("/api/job")
        filename = ((j.get("job") or {}).get("file") or {}).get("name")
        progress = j.get("progress") or {}
        completed = progress.get("completion")
        parts = ["🖨 <b>Ender-3 S1 Pro</b>", ""]
        try:
            con = self.op.get("/api/connection").get("current") or {}
            connected = con.get("state", "Неизвестно")
        except ApiError:
            connected = "Нет данных"
        icons = {"Operational": "🟢", "Printing": "🟢", "Paused": "🟡",
                 "Closed": "🔴", "Offline": "🔴", "Error": "🔴"}
        parts.append(f"{icons.get(connected,'🔹')} <b>Принтер:</b> {esc(connected)}")
        if filename:
            parts.append(f"📄 <b>Файл:</b> {esc(filename)}")
        else:
            parts.append("📄 <b>Задание:</b> нет")
        if isinstance(completed, (int, float)):
            p = max(0.0, min(float(completed), 100.0))
            n = int(round(p / 10))
            parts.append("")
            parts.append("📊 <b>Прогресс: {:.1f}%</b>".format(p))
            parts.append("▰" * n + "▱" * (10 - n))
        elapsed = progress.get("printTime")
        left = progress.get("printTimeLeft")
        if elapsed is not None or left is not None:
            parts.append("⏱ Прошло: "+duration(elapsed)+"  ·  Осталось: "+duration(left))
        try:
            printer = self.op.get("/api/printer")
            temp = printer.get("temperature") or {}
            for key, name, icon in (("tool0","Сопло","🔥"),("bed","Стол","🛏")):
                values = temp.get(key) or {}
                a, t = values.get("actual"), values.get("target")
                if isinstance(a, (int, float)):
                    desc = f"{a:.1f} °C"
                    if isinstance(t,(int,float)) and t > 0:
                        desc += f" / {t:.0f} °C"
                    parts.append(f"{icon} <b>{name}:</b> {desc}")
        except ApiError:
            parts.append("")
            parts.append("ℹ️ Температуры доступны при USB-подключении принтера.")
        return "\n".join(parts)

    def status(self, chat, edit=None):
        self.render(chat, self.status_text(), [
            [button("🔄 Обновить", "menu:status"), button("📷 Снимок", "menu:photo")],
            [button("🎛 Управление", "menu:control"), button("🏠 Меню", "menu:home")],
        ], edit)

    def photo(self, chat):
        data = self.op.snapshot()
        markup = json.dumps(board([
            [button("🔄 Ещё снимок", "menu:photo"),
             button("🖨 Статус", "menu:status")],
            [button("🏠 Главное меню", "menu:home")],
        ]), ensure_ascii=False)
        body, typ = multipart({
            "chat_id": str(chat),
            "caption": "📷 Камера · Ender-3 S1 Pro",
            "reply_markup": markup,
        }, ("photo", "octoprint.jpg", data))
        result = http_request(self.tg.base + "sendPhoto", method="POST",
                              data=body, headers={"Content-Type": typ}, timeout=45)
        if not json.loads(result).get("ok"):
            raise ApiError("Не удалось отправить снимок")

    def files(self, chat, edit=None):
        entries = self.op.get("/api/files/local").get("files", [])
        names = [x.get("name") for x in entries
                 if x.get("type") == "machinecode" and x.get("name")]
        self.file_choices = {str(i): name for i,name in enumerate(names[:12])}
        if not names:
            msg = "📁 <b>G-code</b>\n\nФайлов пока нет.\n"
        else:
            msg = f"📁 <b>G-code</b> · {len(names)} файл(ов)\n\n"
            msg += "Выбери файл для подготовки печати.\n"
            msg += "<i>Запуск требует отдельного подтверждения.</i>"
        rows = [[button("📄 "+name[:35], "file:"+str(i))]
                for i,name in enumerate(names[:12])]
        rows += [[button("🔄 Обновить", "menu:files"),button("🏠 Меню","menu:home")]]
        self.render(chat, msg, rows, edit)

    def control(self, chat, edit=None):
        self.render(chat, "🎛 <b>Управление печатью</b>\n\n"
                    "Выбери действие. Отмена и запуск требуют подтверждения.", [
            [button("⏸ Пауза", "act:pause"), button("▶️ Продолжить", "act:resume")],
            [button("⛔ Отменить печать", "ask:cancel")],
            [button("📁 Выбрать G-code", "menu:files")],
            [button("🏠 Главное меню", "menu:home")],
        ], edit)

    def help(self, chat, edit=None):
        self.render(chat, "❔ <b>Помощь</b>\n\n"
                    "🖨 <b>Состояние</b> — печать, температуры и прогресс.\n"
                    "📷 <b>Камера</b> — снимок с веб-камеры.\n"
                    "📁 <b>G-code</b> — выбрать файл для печати.\n"
                    "🎛 <b>Управление</b> — пауза, продолжение, отмена.\n\n"
                    "Файлы .gcode можно отправлять боту документом (до 10 МБ).\n"
                    "Для запуска печати человек должен быть рядом с принтером.\n\n"
                    "<i>Также работают команды /start, /status, /photo, /files.</i>",
                    BACK, edit)

    def confirm_cancel(self, chat, edit=None):
        self.pending = ("cancel", "", time.monotonic()+90)
        self.render(chat, "⛔ <b>Отменить текущую печать?</b>\n\n"
                    "Это действие нельзя отменить. Подтверждение действует 90 секунд.",
                    [[button("✅ Да, отменить", "do:cancel")],
                     [button("↩️ Не отменять", "menu:control")]], edit)

    def confirm_print(self, chat, filename, edit=None):
        self.pending = ("print", filename, time.monotonic()+90)
        self.render(chat, f"▶️ <b>Запуск печати</b>\n\n"
                    f"📄 {esc(filename)}\n\n"
                    "⚠️ <b>Подтверди только если рядом с принтером есть человек.</b>\n"
                    "Проверь стол и свободный ход осей.\n"
                    "Подтверждение действует 90 секунд.",
                    [[button("✅ Начать печать", "do:print")],
                     [button("↩️ Назад к файлам", "menu:files")]], edit)

    def perform_pending(self, kind):
        if not self.pending or self.pending[0] != kind or self.pending[2] < time.monotonic():
            return False
        name = self.pending[1]
        self.pending = None
        if kind == "cancel":
            self.op.post_json("/api/job", {"command":"cancel"})
        if kind == "print":
            path=urllib.parse.quote(name,safe="")
            self.op.post_json("/api/files/local/"+path, {"command":"select","print":True})
        return True

    def send_error(self, chat, exc):
        self.render(chat, "⚠️ <b>Не удалось выполнить действие</b>\n"
                    +esc(exc), BACK)

    def handle_callback(self, update):
        query=update.get("callback_query") or {}
        msg=query.get("message") or {}
        user=query.get("from") or {}
        chat=msg.get("chat") or {}
        qid=query.get("id")
        permitted=(chat.get("type")=="private" and
                   user.get("id")==self.admin_id and chat.get("id")==self.admin_id)
        if qid:
            try:
                self.tg.request("answerCallbackQuery", {"callback_query_id":qid,
                                 "text": "Нет доступа" if not permitted else ""}, timeout=12)
            except ApiError:
                pass
        if not permitted:
            return
        cid=chat["id"]
        mid=msg.get("message_id")
        data=str(query.get("data") or "")
        try:
            if data=="menu:home":
                self.pending=None
                self.home(cid,mid)
            elif data=="menu:status":
                self.status(cid,mid)
            elif data=="menu:photo":
                self.photo(cid)
            elif data=="menu:files":
                self.pending=None
                self.files(cid,mid)
            elif data=="menu:control":
                self.pending=None
                self.control(cid,mid)
            elif data=="menu:help":
                self.help(cid,mid)
            elif data=="ask:cancel":
                self.confirm_cancel(cid,mid)
            elif data.startswith("file:"):
                name=getattr(self,"file_choices",{}).get(data[5:])
                if name:
                    self.confirm_print(cid,name,mid)
                else:
                    self.render(cid,"Список файлов устарел. Обнови его.",BACK,mid)
            elif data in ("do:cancel","do:print"):
                if self.perform_pending(data[3:]):
                    self.render(cid,"✅ <b>Команда отправлена в OctoPrint.</b>",
                                [[button("🖨 Состояние","menu:status")],
                                 [button("🏠 Главное меню","menu:home")]],mid)
                else:
                    self.render(cid,"⌛ Подтверждение истекло. Повтори действие.",BACK,mid)
            elif data in ("act:pause","act:resume"):
                self.op.post_json("/api/job",{"command":"pause","action":data[4:]})
                self.status(cid,mid)
        except ApiError as exc:
            self.send_error(cid,exc)

    def process(self,msg):
        if self.role(msg)!="admin":
            return
        chat=msg["chat"]["id"]
        cmd,arg=self.command(msg.get("text",""))
        try:
            if cmd in ("/start","/help","/menu") or msg.get("text") in ("🏠 Меню","Меню"):
                self.home(chat)
            elif cmd=="/status":
                self.status(chat)
            elif cmd=="/photo":
                self.photo(chat)
            elif cmd=="/files":
                self.files(chat)
            elif cmd=="/control":
                self.control(chat)
            elif cmd=="/cancel":
                self.confirm_cancel(chat)
            elif cmd=="/confirmcancel":
                ok=self.perform_pending("cancel")
                self.render(chat,"✅ Отмена отправлена." if ok else "⌛ Подтверждение истекло.",BACK)
            elif cmd=="/print":
                if not arg or "/" in arg or "\\" in arg or not arg.lower().endswith(GCODE_EXT):
                    self.render(chat,"Формат: <code>/print имя.gcode</code>",BACK)
                else:
                    self.confirm_print(chat,arg)
            elif cmd=="/confirmprint":
                ok=self.perform_pending("print")
                self.render(chat,"✅ Запуск отправлен." if ok else "⌛ Подтверждение истекло.",BACK)
            elif cmd in ("/pause","/resume"):
                self.op.post_json("/api/job",{"command":"pause","action":cmd[1:]})
                self.status(chat)
            elif msg.get("document"):
                doc=msg["document"]
                filename=os.path.basename(doc.get("file_name",""))
                size=int(doc.get("file_size") or 0)
                if not filename.lower().endswith(GCODE_EXT) or size>MAX_GCODE_BYTES:
                    self.render(chat,"Поддерживается G-code до 10 МБ.",BACK)
                    return
                self.op.upload(filename,self.tg.document_bytes(doc["file_id"]))
                self.render(chat,"✅ <b>Файл загружен:</b> "+esc(filename)+"\n"
                            "Печать не запущена.",
                            [[button("📁 G-code","menu:files")],
                             [button("🏠 Главное меню","menu:home")]])
            else:
                self.home(chat)
        except ApiError as exc:
            self.send_error(chat,exc)

    def poll(self):
        while True:
            try:
                updates=self.tg.request("getUpdates",{"offset":self.offset,"timeout":25,
                                   "allowed_updates":["message","callback_query"]},timeout=35)
                for update in updates:
                    seq=int(update["update_id"])
                    if seq < self.offset:
                        continue
                    try:
                        if "callback_query" in update:
                            self.handle_callback(update)
                        else:
                            self.process(update.get("message") or {})
                    except Exception:
                        LOG.exception("Failed to handle update")
                    self.save_offset(seq+1)
            except ApiError as exc:
                LOG.warning("Polling unavailable: %s",exc)
                time.sleep(8)

def main():
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
    token=required_env("TELEGRAM_BOT_TOKEN")
    key=required_env("OCTOPRINT_API_KEY")
    admin=int(required_env("ADMIN_TELEGRAM_ID"))
    tg=Telegram(token)
    bot=PrettyBot(tg,OctoPrint(os.getenv("OCTOPRINT_URL","http://127.0.0.1"),key),
                  admin,os.getenv("BOT_STATE_FILE"))
    LOG.info("Home3D UI started, single owner")
    bot.poll()

if __name__=="__main__":
    main()