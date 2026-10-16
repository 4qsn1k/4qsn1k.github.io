#!/usr/bin/env python3
"""Telegram front-end for local OctoPrint, restricted to exactly one Telegram ID.

Uses only the Python standard library. Designed to run on the OctoPi host.
"""
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LOG = logging.getLogger("octo-telegram")
MAX_GCODE_BYTES = 10 * 1024 * 1024
GCODE_EXT = (".gcode", ".gco", ".gc")


class ApiError(Exception):
    pass


def required_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing {name}")
    return value


def http_request(url, method="GET", data=None, headers=None, timeout=15, limit=None):
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if limit is None:
                return response.read()
            result = response.read(limit + 1)
            if len(result) > limit:
                raise ApiError("Ответ превышает допустимый размер")
            return result
    except urllib.error.HTTPError as exc:
        raise ApiError(f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ApiError("Сервис недоступен") from None


def multipart(fields, file_field=None):
    boundary = "----octotelegram" + secrets.token_hex(12)
    payload = bytearray()
    for name, value in fields.items():
        payload.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    if file_field:
        name, filename, data = file_field
        safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', filename)[:100]
        payload.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{safe_name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
        payload.extend(data)
        payload.extend(b"\r\n")
    payload.extend(f"--{boundary}--\r\n".encode())
    return bytes(payload), f"multipart/form-data; boundary={boundary}"


class Telegram:
    def __init__(self, token):
        self.base = f"https://api.telegram.org/bot{token}/"
        self.file_base = f"https://api.telegram.org/file/bot{token}/"

    def request(self, name, params=None, timeout=35):
        body = json.dumps(params or {}, ensure_ascii=False).encode()
        data = http_request(self.base + name, method="POST", data=body,
                            headers={"Content-Type": "application/json"}, timeout=timeout)
        try:
            response = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            raise ApiError("Некорректный ответ Telegram") from None
        if not response.get("ok"):
            raise ApiError("Ошибка Telegram API")
        return response["result"]

    def message(self, chat_id, text):
        return self.request("sendMessage", {"chat_id": chat_id, "text": text[:3900]})

    def photo(self, chat_id, blob):
        form, content_type = multipart({"chat_id": str(chat_id)}, ("photo", "octoprint.jpg", blob))
        data = http_request(self.base + "sendPhoto", method="POST", data=form,
                            headers={"Content-Type": content_type}, timeout=40)
        if not json.loads(data).get("ok"):
            raise ApiError("Не удалось отправить кадр")

    def document_bytes(self, file_id):
        info = self.request("getFile", {"file_id": file_id})
        size = int(info.get("file_size") or 0)
        if size > MAX_GCODE_BYTES:
            raise ApiError("G-code больше 10 МБ. Загрузите его через веб-интерфейс.")
        path = info.get("file_path", "")
        if not path or path.startswith("/") or ".." in path.split("/"):
            raise ApiError("Некорректный путь файла")
        return http_request(self.file_base + urllib.parse.quote(path, safe="/"), timeout=90,
                            limit=MAX_GCODE_BYTES)


class OctoPrint:
    def __init__(self, base, key):
        base = base.rstrip("/")
        parsed = urllib.parse.urlparse(base)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Invalid OCTOPRINT_URL")
        self.base = base
        self.key = key

    def request(self, path, data=None, content_type="application/json"):
        headers = {"X-Api-Key": self.key}
        if data is not None:
            headers["Content-Type"] = content_type
        raw = http_request(self.base + path, method="POST" if data is not None else "GET",
                           data=data, headers=headers, timeout=60 if data is not None else 15)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise ApiError("Некорректный ответ OctoPrint") from None

    def get(self, path):
        return self.request(path)

    def post_json(self, path, data):
        return self.request(path, json.dumps(data).encode())

    def snapshot(self):
        # The default OctoPi webcam proxy. The camera service must be running.
        url = self.base + "/webcam/?action=snapshot"
        blob = http_request(url, timeout=15, limit=5 * 1024 * 1024)
        if not blob.startswith(b"\xff\xd8\xff"):
            raise ApiError("Камера не вернула JPEG. Проверьте C270 и видеопоток.")
        return blob

    def upload(self, filename, data):
        form, content_type = multipart({}, ("file", filename, data))
        return self.request("/api/files/local", form, content_type)


class Bot:
    def __init__(self, telegram, octoprint, admin_id, state_file=None):
        if admin_id <= 0:
            raise ValueError("ADMIN_TELEGRAM_ID must be a positive ID")
        self.tg = telegram
        self.op = octoprint
        self.admin_id = admin_id
        self.state_file = Path(state_file) if state_file else None
        self.offset = self.load_offset()
        self.pending = None

    def load_offset(self):
        if self.state_file and self.state_file.exists():
            try:
                return int(json.loads(self.state_file.read_text())["offset"])
            except (OSError, ValueError, KeyError):
                raise ValueError("Corrupt offset state; stop and inspect before restarting")
        return 0

    def save_offset(self, offset):
        self.offset = offset
        if self.state_file:
            temp = self.state_file.with_name(self.state_file.name + ".tmp")
            temp.write_text(json.dumps({"offset": offset}))
            os.replace(temp, self.state_file)

    def role(self, msg):
        chat = msg.get("chat") or {}
        user = msg.get("from") or {}
        if chat.get("type") != "private" or not isinstance(user.get("id"), int):
            return None
        if int(chat.get("id") or -1) != user["id"]:
            return None
        if user["id"] == self.admin_id:
            return "admin"
        return None

    def command(self, text):
        cmd = (text or "").strip().split(maxsplit=1)
        if not cmd:
            return "", ""
        return cmd[0].lower().split("@")[0], cmd[1].strip() if len(cmd) == 2 else ""

    def safe_reply(self, chat_id, text):
        self.tg.message(chat_id, text)

    def photo(self, chat_id):
        self.tg.photo(chat_id, self.op.snapshot())

    def format_status(self):
        job = self.op.get("/api/job")
        name = ((job.get("job") or {}).get("file") or {}).get("name") or "нет"
        progress = (job.get("progress") or {}).get("completion")
        progress = f"{progress:.1f}%" if isinstance(progress, (int, float)) else "—"
        text = ["Ender-3 S1 Pro", f"Задание: {name}", f"Выполнено: {progress}"]
        try:
            printer = self.op.get("/api/printer")
            for key, label in (("tool0", "Сопло"), ("bed", "Стол")):
                t = (printer.get("temperature") or {}).get(key) or {}
                if isinstance(t.get("actual"), (int, float)):
                    text.append(f"{label}: {t['actual']:.1f} °C")
            state = (printer.get("state") or {}).get("text")
            if state:
                text.insert(1, f"Состояние: {state}")
        except ApiError:
            text.append("Температуры временно недоступны")
        return "\n".join(text)

    def process(self, msg):
        role = self.role(msg)
        if not role:
            return
        chat_id = msg["chat"]["id"]
        cmd, arg = self.command(msg.get("text", ""))
        try:
            if cmd in ("/start", "/help"):
                self.safe_reply(chat_id, "Команды: /status, /photo, /files, /pause, /resume, /cancel, /confirmcancel, /print ИМЯ.gcode, /confirmprint. Для загрузки G-code отправь файл документом. Запуск печати подтверждается отдельной командой. Бот работает только в личном чате.")
            elif cmd == "/status":
                self.safe_reply(chat_id, self.format_status())
            elif cmd == "/photo":
                self.photo(chat_id)
            elif cmd == "/files":
                files = self.op.get("/api/files/local").get("files", [])
                names = [x.get("name", "") for x in files if x.get("type") == "machinecode"]
                self.safe_reply(chat_id, "G-code:\n" + ("\n".join(names[-30:]) if names else "нет файлов"))
            elif cmd in ("/pause", "/resume"):
                action = cmd[1:]
                self.op.post_json("/api/job", {"command": "pause", "action": action})
                self.safe_reply(chat_id, "Отправлено: " + action)
            elif cmd == "/cancel":
                self.pending = ("cancel", "", time.monotonic() + 90)
                self.safe_reply(chat_id, "Отмена печати. Подтверди командой /confirmcancel в течение 90 секунд.")
            elif cmd == "/confirmcancel":
                if not self.pending or self.pending[0] != "cancel" or self.pending[2] < time.monotonic():
                    self.safe_reply(chat_id, "Нет активного подтверждения отмены.")
                else:
                    self.pending = None
                    self.op.post_json("/api/job", {"command": "cancel"})
                    self.safe_reply(chat_id, "Команда отмены отправлена.")
            elif cmd == "/print":
                if not arg or "/" in arg or "\\" in arg or not arg.lower().endswith(GCODE_EXT):
                    self.safe_reply(chat_id, "Формат: /print ИМЯ.gcode (файл из /files).")
                    return
                self.pending = ("print", arg, time.monotonic() + 90)
                self.safe_reply(chat_id, f"Подтверждение запуска: {arg}\nНачинай только при наличии человека рядом с принтером. Если человек рядом, отправь /confirmprint в течение 90 секунд.")
            elif cmd == "/confirmprint":
                if not self.pending or self.pending[0] != "print" or self.pending[2] < time.monotonic():
                    self.safe_reply(chat_id, "Нет активного подтверждения запуска.")
                else:
                    filename = self.pending[1]
                    self.pending = None
                    path = urllib.parse.quote(filename, safe="")
                    self.op.post_json("/api/files/local/" + path, {"command": "select", "print": True})
                    self.safe_reply(chat_id, "Команда запуска передана OctoPrint.")
            elif msg.get("document"):
                doc = msg["document"]
                filename = os.path.basename(doc.get("file_name", ""))
                size = int(doc.get("file_size") or 0)
                if not filename.lower().endswith(GCODE_EXT) or not filename or size > MAX_GCODE_BYTES:
                    self.safe_reply(chat_id, "Принимаю только G-code размером до 10 МБ.")
                    return
                data = self.tg.document_bytes(doc["file_id"])
                self.op.upload(filename, data)
                self.safe_reply(chat_id, f"Загружено: {filename}. Печать НЕ запущена.")
            elif cmd:
                self.safe_reply(chat_id, "Неизвестная команда. Список: /help")
        except ApiError as exc:
            self.safe_reply(chat_id, "Ошибка: " + str(exc))

    def poll(self):
        while True:
            try:
                updates = self.tg.request("getUpdates", {"offset": self.offset, "timeout": 25,
                                                            "allowed_updates": ["message"]}, timeout=35)
                for update in updates:
                    uid = int(update["update_id"])
                    if uid < self.offset:
                        continue
                    try:
                        self.process(update.get("message") or {})
                    except Exception:
                        # Keep service alive but never log tokens, IDs or message bodies.
                        LOG.exception("Failed to process update")
                    self.save_offset(uid + 1)
            except ApiError as exc:
                LOG.warning("Telegram polling failed: %s", exc)
                time.sleep(8)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = required_env("TELEGRAM_BOT_TOKEN")
    key = required_env("OCTOPRINT_API_KEY")
    admin_id = int(required_env("ADMIN_TELEGRAM_ID"))
    op = OctoPrint(os.getenv("OCTOPRINT_URL", "http://127.0.0.1"), key)
    bot = Bot(Telegram(token), op, admin_id,
              os.getenv("BOT_STATE_FILE", "/var/lib/octo-telegram/offset.json"))
    LOG.info("OctoPrint Telegram bridge started (permissions: owner only)")
    bot.poll()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(2)