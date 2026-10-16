"""Formatted dashboard with Telegram-native text and action buttons."""
import html
from datetime import datetime
import db

STATUS_ORDER = {"overdue": 0, "today": 1, "soon": 2, "later": 3, "unknown": 4}
ICONS = {"overdue": "🔴", "today": "🟡", "soon": "🟢", "later": "🟢", "unknown": "⚪"}
MARKERS = {"overdue": "!", "today": "*", "soon": ">", "later": "·", "unknown": "?"}

def classify(pet, today):
    last = db.last_fed(pet["id"])
    due = db.next_feed_date(pet)
    if due is None:
        return {"pet": pet, "last": last, "due": None, "status": "unknown"}
    if due < today:
        status = "overdue"
    elif due == today:
        status = "today"
    elif (due-today).days <= 3:
        status = "soon"
    else:
        status = "later"
    return {"pet":pet, "last":last, "due":due, "status":status}

def entries(owner, today):
    result = [classify(p, today) for p in db.pets(owner)]
    result.sort(key=lambda row: (
        STATUS_ORDER[row["status"]],
        row["due"].isoformat() if row["due"] else "9999-12-31",
        row["pet"]["id"]
    ))
    return result

def short_name(name, limit=19):
    return name if len(name) <= limit else name[:limit-1] + "…"

def day_label(value):
    return value.strftime("%d.%m") if value else "—"

def stats(rows):
    return {key:sum(r["status"]==key for r in rows) for key in STATUS_ORDER}

def table_text(rows, tz):
    name_w, date_w = 21, 6
    top = "┌" + "─"*name_w + "┬" + "─"*date_w + "┬" + "─"*date_w + "┐"
    split = "├" + "─"*name_w + "┼" + "─"*date_w + "┼" + "─"*date_w + "┤"
    end = "└" + "─"*name_w + "┴" + "─"*date_w + "┴" + "─"*date_w + "┘"
    lines = [top, f"│{' Питомец':<{name_w}}│{'Было':^{date_w}}│{'Далее':^{date_w}}│",split]
    for item in rows:
        name = MARKERS[item["status"]] + " " + short_name(item["pet"]["name"], name_w-2)
        when = item["last"].astimezone(tz).date() if item["last"] else None
        lines.append(f"│{name:<{name_w}}│{day_label(when):^{date_w}}│{day_label(item['due']):^{date_w}}│")
    lines.append(end)
    return "<pre>" + html.escape("\n".join(lines)) + "</pre>"

def home_text(owner, tz, today=None):
    today = today or datetime.now(tz).date()
    rows = entries(owner, today)
    counts = stats(rows)
    lines = [
        f"🦎 <b>ЭКЗОТЕКА</b>  ·  {today.strftime('%d.%m.%Y')}",
        "━━━━━━━━━━━━━━",
        "📊 <b>СТАТУС КОЛЛЕКЦИИ</b>",
        f"🐾 Питомцев: <b>{len(rows)}</b>",
        f"🔴 Просрочено: <b>{counts['overdue']}</b>   🟡 Сегодня: <b>{counts['today']}</b>",
        f"🟢 По графику: <b>{counts['soon']+counts['later']}</b>   ⚪ Без даты: <b>{counts['unknown']}</b>",
        "",
    ]
    urgent = [item for item in rows if item["status"] in ("overdue", "today")]
    if urgent:
        lines.append("⚠️ <b>ТРЕБУЮТ ВНИМАНИЯ</b>")
        for item in urgent[:7]:
            lines.append(f"{ICONS[item['status']]} {html.escape(item['pet']['name'])} — {day_label(item['due'])}")
        if len(urgent)>7:
            lines.append(f"…и ещё {len(urgent)-7}")
        lines.append("")
    lines.extend(["📋 <b>ТАБЛИЦА КОРМЛЕНИЙ</b>", "<i>Последнее / Следующее</i>"])
    if rows:
        lines.append(table_text(rows,tz))
        lines.append("<i>! просрочено · * сегодня · > скоро · · позже · ? нет графика</i>")
    else:
        lines.append("Питомцев пока нет.")
    if counts["unknown"]:
        lines.append(f"⚙️ <b>Задай периоды:</b> ещё {counts['unknown']} питомцев без следующей даты.")
    lines.append("👇 <b>Накормил</b> — отметка за сегодня; <b>Периоды</b> — настройка графиков.")
    return "\n".join(lines)

def feeding_text(owner, tz, today=None):
    today = today or datetime.now(tz).date()
    rows = entries(owner, today)
    counts = stats(rows)
    lines = [
        "🍽 <b>ОТМЕТКА КОРМЛЕНИЯ</b>", "━━━━━━━━━━━━━━",
        f"🔴 Просрочено: <b>{counts['overdue']}</b>   🟡 Сегодня: <b>{counts['today']}</b>",
        "Выбери животное ниже. Перед сохранением будет подтверждение.", ""
    ]
    for item in rows:
        p = item["pet"]
        fed = item["last"].astimezone(tz).date() if item["last"] else None
        lines.append(f"{ICONS[item['status']]} <b>{html.escape(p['name'])}</b>   "
                     f"{day_label(fed)} → {day_label(item['due'])}")
    if not rows:
        lines.append("Животных пока нет.")
    return "\n".join(lines),rows
