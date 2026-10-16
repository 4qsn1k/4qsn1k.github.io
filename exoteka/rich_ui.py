"""Telegram Bot API 10.3 Native Rich Messages with automatic classic fallback.

Buttons retain the original callback_data. The same screen is edited in place.
The client's ability to render native rich content is not visible to bots:
users may opt into /classic if their Telegram client is outdated.
"""
import html
import logging
import re
import sqlite3
from datetime import datetime
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import (
    InputRichMessage, InputRichBlockParagraph, InputRichBlockSectionHeading,
    InputRichBlockDivider, InputRichBlockFooter, InputRichBlockTable,
    InputRichBlockButtons, RichBlockTableCell, RichMessageButton,
)
import db

log = logging.getLogger(__name__)
HTML_TAG = re.compile(r"<[^>]+>")
MODES = ("rich", "classic")

def init():
    with db.connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS ui_modes(
            user_id INTEGER PRIMARY KEY,
            mode TEXT NOT NULL CHECK(mode IN ('rich','classic')))""")

def set_mode(user_id, mode):
    if mode not in MODES:
        raise ValueError("Unsupported UI mode")
    with db.connect() as con:
        con.execute("""INSERT INTO ui_modes(user_id,mode) VALUES (?,?)
            ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode""",
            (user_id, mode))

def get_mode(user_id):
    with db.connect() as con:
        row = con.execute("SELECT mode FROM ui_modes WHERE user_id=?", (user_id,)).fetchone()
    return row["mode"] if row else "rich"

def plain(text):
    return html.unescape(HTML_TAG.sub("", str(text)))

def rich_table(values, *, header=True):
    cells=[]
    for index,row in enumerate(values):
        cells.append([
            RichBlockTableCell(text=str(value),
                               **({'is_header': True} if header and index == 0 else {}),
                               align="left" if col==0 else "center",valign="middle")
            for col,value in enumerate(row)
        ])
    return InputRichBlockTable(cells=cells,is_bordered=True,is_striped=True,is_compact=True)

def buttons(markup):
    if not markup:
        return []
    result=[]
    for row in markup.inline_keyboard:
        items=[]
        for item in row:
            details={"text":item.text}
            if item.style:
                details["style"]=item.style
            if item.callback_data:
                details["callback_data"]=item.callback_data
            elif item.url:
                details["url"]=item.url
            else:
                # Keep exotic button types in the classic reply markup fallback.
                return []
            items.append(RichMessageButton(**details))
        if items:
            result.append(InputRichBlockButtons(buttons=items))
    return result

def line_blocks(text):
    """Turn the existing HTML screen into heading, paragraph, divider and footer blocks."""
    raw=str(text).replace("\r","")
    pieces=raw.split("\n")
    blocks=[]
    for line in pieces:
        stripped=line.strip()
        if not stripped:
            continue
        if stripped in ("━━━━━━━━━━━━━━", "──────────────"):
            blocks.append(InputRichBlockDivider())
            continue
        value=plain(stripped)
        if not value:
            continue
        if stripped.startswith("<i>") or stripped.startswith("ℹ️ "):
            blocks.append(InputRichBlockFooter(text=value))
        elif (stripped.startswith("<b>") or "<b>" in stripped) and len(value)<85 and (
            value.isupper() or value.startswith(("🦎 ","🍽 ","🛠 ","⚙️ ","📋 ","📦 ","✅ ","🔁 ","✏️ ","🪪 "))):
            blocks.append(InputRichBlockSectionHeading(text=value,size=4))
        else:
            blocks.append(InputRichBlockParagraph(text=value))
    return blocks[:450]

def home_blocks(owner, tz):
    import dashboard
    today = datetime.now(tz).date()
    rows=dashboard.entries(owner,today)
    counts=dashboard.stats(rows)
    blocks=[
        InputRichBlockSectionHeading(text=f"🦎 ЭкзоТека · {today.strftime('%d.%m.%Y')}",size=3),
        InputRichBlockParagraph(text=(f"🐾 {len(rows)} питомцев    🔴 {counts['overdue']} просрочено\n"
            f"🟡 {counts['today']} сегодня    🟢 {counts['soon']+counts['later']} позже\n"
            f"⚪ {counts['unknown']} без графика")),
        InputRichBlockDivider(),
        InputRichBlockSectionHeading(text="📋 Кормления",size=4),
    ]
    table=[["Питомец","Было","Далее"]]
    for row in rows:
        last=row['last'].astimezone(tz).date() if row['last'] else None
        name=dashboard.ICONS[row['status']]+" "+row['pet']['name']
        table.append([name,dashboard.day_label(last), dashboard.day_label(row["due"])])
    if rows:
        blocks.append(rich_table(table))
    else:
        blocks.append(InputRichBlockParagraph(text="Добавь первого питомца."))
    if counts["unknown"]:
        blocks.append(InputRichBlockFooter(text="⚙️ Укажи период кормления, чтобы увидеть следующую дату."))
    blocks.append(InputRichBlockFooter(text="🔴 Просрочено · 🟡 Сегодня · 🟢 Позже · ⚪ Без графика"))
    return blocks

def pet_blocks(p, tz):
    import bot
    last=db.last_fed(p["id"])
    due=db.next_feed_date(p)
    sex={"male":"♂ Самец","female":"♀ Самка"}.get(p["sex"],"Не определён")
    lines=[
        ["Вид",p["species"]],
        ["Вылупление",bot.d(p["hatched"])],
        ["Приобретение",bot.d(p["acquired"])],
        ["Пол",sex],
        ["Генотип / морфа",p["morph"] or "Не указана"],
    ]
    data=[
        ["Период",f"{p['interval_days']} дней" if p["interval_days"] else "Не задан"],
        ["Последнее",last.astimezone(tz).strftime('%d.%m.%Y') if last else "Нет"],
        ["Следующее",due.strftime("%d.%m.%Y") if due else "—"],
        ["Статус",bot.status(p)]
    ]
    return [
        InputRichBlockSectionHeading(text=f"{bot.animal_emoji(p)} {p['name']}",size=3),
        InputRichBlockParagraph(text=p['species']),
        InputRichBlockDivider(),
        InputRichBlockSectionHeading(text="🪪 Паспорт",size=4),
        rich_table(lines,header=False),
        InputRichBlockSectionHeading(text="🍽 Кормление",size=4),
        rich_table(data,header=False),
        InputRichBlockFooter(text="Изменить сведения и график можно кнопками ниже."),
    ]

def feeding_blocks(owner, tz):
    import dashboard
    rows=dashboard.entries(owner,datetime.now(tz).date())
    blocks=[InputRichBlockSectionHeading(text="🍽 Кормления",size=3),
            InputRichBlockParagraph(text="Выбери животное и подтверди кормление."),
            InputRichBlockDivider()]
    data=[["Питомец","Было","Далее"]]
    for row in rows:
        last=row["last"].astimezone(tz).date() if row["last"] else None
        data.append([dashboard.ICONS[row["status"]]+" "+row["pet"]["name"],
                     dashboard.day_label(last),dashboard.day_label(row["due"])])
    if rows:
        blocks.append(rich_table(data))
    return blocks

def prepare(text, markup=None, *, owner=None, tz=None):
    if owner is not None and "ТАБЛИЦА КОРМЛЕНИЙ" in (text or ""):
        blocks=home_blocks(owner,tz)
    elif owner is not None and "ОТМЕТКА КОРМЛЕНИЯ" in (text or ""):
        blocks=feeding_blocks(owner,tz)
    elif owner is not None and "ПАСПОРТ ПИТОМЦА" in (text or ""):
        match=re.search(r"№(\d+)",text)
        p=db.pet_by_id(int(match.group(1)),owner) if match else None
        blocks=pet_blocks(p,tz) if p else line_blocks(text)
    else:
        blocks=line_blocks(text)
    blocks.extend(buttons(markup))
    return InputRichMessage(blocks=blocks)

def context():
    import bot
    return bot.owner_id(),bot.TZ

async def edit_screen(message, text=None, *, parse_mode=None, reply_markup=None, **kwargs):
    chat_id=message.chat.id
    owner,tz=context()
    if get_mode(chat_id) != "classic" and text:
        try:
            rich=prepare(text,reply_markup,owner=owner,tz=tz)
            return await message.edit_text(text=None,parse_mode=None,
                                           rich_message=rich,reply_markup=None,**kwargs)
        except TelegramBadRequest as exc:
            if "message is not modified" in str(exc).lower():
                return None
            log.warning("Rich edit unsupported: %s. Trying classic.",str(exc)[:180])
    try:
        return await message.edit_text(text=text,parse_mode=parse_mode,
                                       reply_markup=reply_markup,**kwargs)
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc).lower():
            return None
        raise

async def send_screen(message, text, *,parse_mode=None,reply_markup=None,**kwargs):
    chat_id=message.chat.id
    owner,tz=context()
    if get_mode(chat_id) != "classic":
        try:
            return await message.bot.send_rich_message(
                chat_id=chat_id,rich_message=prepare(text,reply_markup,owner=owner,tz=tz))
        except TelegramBadRequest as exc:
            log.warning("Rich send unsupported: %s. Trying classic.",str(exc)[:180])
    return await message.answer(text,parse_mode=parse_mode,reply_markup=reply_markup,**kwargs)

async def edit_by_id(bot,chat_id,message_id,text,*,parse_mode=None,reply_markup=None):
    owner,tz=context()
    if get_mode(chat_id)!="classic":
        try:
            return await bot.edit_message_text(chat_id=chat_id,message_id=message_id,
                text=None,parse_mode=None,reply_markup=None,
                rich_message=prepare(text,reply_markup,owner=owner,tz=tz))
        except TelegramBadRequest as exc:
            if "message is not modified" in str(exc).lower():
                return None
            log.warning("Rich ID edit unsupported: %s. Trying classic.",str(exc)[:180])
    return await bot.edit_message_text(chat_id=chat_id,message_id=message_id,
        text=text,parse_mode=parse_mode,reply_markup=reply_markup)
