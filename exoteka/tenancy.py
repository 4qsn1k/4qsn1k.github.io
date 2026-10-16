"""Multi-collection access, private invitations, and per-update tenant context.

The existing pets.owner_id column is retained as the collection key, so
production pet IDs, feeding history and the original owner do not change.
Every read/write in bot handlers uses the active collection key from this module.
"""
import contextvars
import hashlib
import html
import secrets
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from aiogram import BaseMiddleware, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery
import db
import rich_ui

router = Router()
ACTOR = contextvars.ContextVar("exoteka_actor", default=None)
TTL_HOURS = 48
BOT_USERNAME = "ExoTekaBot"

def utc_now():
    return datetime.now(timezone.utc)

def migrate(legacy_owner=None, legacy_users=()):
    with db.connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS collections (
            owner_id INTEGER PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'Моя коллекция',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS collection_members (
            owner_id INTEGER NOT NULL REFERENCES collections(owner_id),
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('owner','editor')),
            joined_at TEXT NOT NULL,
            PRIMARY KEY(owner_id,user_id)
        );
        CREATE INDEX IF NOT EXISTS collection_members_user_idx
            ON collection_members(user_id);
        CREATE TABLE IF NOT EXISTS collection_users (
            user_id INTEGER PRIMARY KEY,
            active_owner_id INTEGER,
            display_name TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS collection_invites (
            token_hash TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL REFERENCES collections(owner_id),
            created_by INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            redeemed_by INTEGER,
            redeemed_at TEXT,
            revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS invites_owner_idx ON collection_invites(owner_id);
        """)
        if legacy_owner is None:
            return
        t=utc_now().isoformat()
        existing=c.execute("SELECT 1 FROM collections WHERE owner_id=?",(legacy_owner,)).fetchone()
        if existing:
            return
        c.execute("INSERT INTO collections(owner_id,title,created_at) VALUES (?,?,?)",
                  (legacy_owner, "Моя коллекция", t))
        for user,role in [(legacy_owner,"owner")]+[(u,"editor") for u in legacy_users if u!=legacy_owner]:
            c.execute("INSERT OR IGNORE INTO collection_members(owner_id,user_id,role,joined_at) VALUES (?,?,?,?)",
                      (legacy_owner,user,role,t))
            c.execute("INSERT OR IGNORE INTO collection_users(user_id,active_owner_id,created_at) VALUES (?,?,?)",
                      (user,legacy_owner,t))

def touch_user(user_id, display=None):
    with db.connect() as c:
        c.execute("INSERT OR IGNORE INTO collection_users(user_id,created_at) VALUES(?,?)",
                  (user_id,utc_now().isoformat()))
        if display:
            c.execute("UPDATE collection_users SET display_name=? WHERE user_id=?",
                      (str(display)[:100],user_id))

def active_owner(user_id):
    if not user_id:
        return None
    with db.connect() as c:
        record=c.execute("""SELECT u.active_owner_id AS id
            FROM collection_users u
            JOIN collection_members m
              ON m.user_id=u.user_id AND m.owner_id=u.active_owner_id
            WHERE u.user_id=?""",(user_id,)).fetchone()
        return record["id"] if record else None

def actor_id():
    return ACTOR.get()

def current_owner():
    return active_owner(actor_id())

def is_member(user_id,owner):
    if not user_id or not owner:
        return False
    with db.connect() as c:
        return c.execute("SELECT 1 FROM collection_members WHERE owner_id=? AND user_id=?",
                         (owner,user_id)).fetchone() is not None

def is_owner(user_id,owner):
    return user_id==owner and is_member(user_id,owner)

def owns_collection(user_id):
    with db.connect() as c:
        return c.execute("SELECT 1 FROM collections WHERE owner_id=?",(user_id,)).fetchone() is not None

def create_own(user_id):
    touch_user(user_id)
    t=utc_now().isoformat()
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute("INSERT OR IGNORE INTO collections(owner_id,title,created_at) VALUES(?,?,?)",
                  (user_id,"Моя коллекция",t))
        c.execute("""INSERT OR IGNORE INTO collection_members(owner_id,user_id,role,joined_at)
                  VALUES(?,?,'owner',?)""",(user_id,user_id,t))
        c.execute("UPDATE collection_users SET active_owner_id=? WHERE user_id=?",(user_id,user_id))
    return user_id

def memberships(user_id):
    with db.connect() as c:
        return c.execute("""SELECT co.owner_id,co.title, m.role,
              (SELECT COUNT(*) FROM pets p WHERE p.owner_id=co.owner_id AND p.archived_at IS NULL) AS pet_count
            FROM collection_members m JOIN collections co ON co.owner_id=m.owner_id
            WHERE m.user_id=? ORDER BY (co.owner_id=?) DESC, co.created_at ASC""",
            (user_id,user_id)).fetchall()

def set_active(user_id,owner):
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        if not c.execute("SELECT 1 FROM collection_members WHERE user_id=? AND owner_id=?",
                         (user_id,owner)).fetchone():
            return False
        c.execute("UPDATE collection_users SET active_owner_id=? WHERE user_id=?",
                  (owner,user_id))
        return True

def rename(owner,actor,title):
    title=title.strip()
    if not is_owner(actor,owner) or not 1<=len(title)<=48:
        return False
    with db.connect() as c:
        c.execute("UPDATE collections SET title=? WHERE owner_id=?",(title,owner))
    return True

def members(owner):
    with db.connect() as c:
        return c.execute("""SELECT m.user_id,m.role,u.display_name
          FROM collection_members m
          LEFT JOIN collection_users u ON u.user_id=m.user_id
          WHERE m.owner_id=? ORDER BY m.role='owner' DESC,m.joined_at""",
          (owner,)).fetchall()

def invite_link(owner,actor):
    if not is_owner(actor,owner):
        raise PermissionError("Only collection owner can invite")
    token=secrets.token_urlsafe(18)
    hashval=hashlib.sha256(token.encode()).hexdigest()
    t=utc_now()
    with db.connect() as c:
        c.execute("INSERT INTO collection_invites(token_hash,owner_id,created_by,created_at,expires_at) VALUES(?,?,?,?,?)",
                  (hashval,owner,actor,t.isoformat(),(t+timedelta(hours=TTL_HOURS)).isoformat()))
    return token, f"https://t.me/{BOT_USERNAME}?start=join_{token}"

def invitation(code):
    if not code or not re.fullmatch(r'[A-Za-z0-9_-]{24}',code):
        return None
    hashed=hashlib.sha256(code.encode()).hexdigest()
    with db.connect() as c:
        row=c.execute("""SELECT i.*, co.title FROM collection_invites i
                         JOIN collections co ON co.owner_id=i.owner_id
                         WHERE i.token_hash=?""",(hashed,)).fetchone()
    if not row or row["revoked_at"] or row["redeemed_at"] or datetime.fromisoformat(row["expires_at"])<=utc_now():
        return None
    return row

def accept(code,user_id):
    """Atomic single-use token redemption. Personal collections are preserved."""
    if not code or not re.fullmatch(r'[A-Za-z0-9_-]{24}',code):
        return None
    hashed=hashlib.sha256(code.encode()).hexdigest()
    t=utc_now()
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        row=c.execute("""SELECT * FROM collection_invites WHERE token_hash=?""",(hashed,)).fetchone()
        if not row or row["revoked_at"] or row["redeemed_at"] or datetime.fromisoformat(row["expires_at"])<=t:
            return None
        owner=row["owner_id"]
        if owner==user_id:
            return None
        c.execute("INSERT OR IGNORE INTO collection_users(user_id,created_at) VALUES(?,?)",
                  (user_id,t.isoformat()))
        c.execute("""INSERT OR IGNORE INTO collection_members(owner_id,user_id,role,joined_at)
                    VALUES(?,?,'editor',?)""",(owner,user_id,t.isoformat()))
        c.execute("UPDATE collection_users SET active_owner_id=? WHERE user_id=?",(owner,user_id))
        c.execute("UPDATE collection_invites SET redeemed_by=?,redeemed_at=? WHERE token_hash=?",
                  (user_id,t.isoformat(),hashed))
        return owner

def leave(user_id,owner):
    if not owner or user_id==owner:
        return False
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        gone=c.execute("DELETE FROM collection_members WHERE owner_id=? AND user_id=?",
                       (owner,user_id)).rowcount==1
        if gone:
            replacement=c.execute("SELECT owner_id FROM collection_members WHERE user_id=? ORDER BY owner_id=? DESC, joined_at LIMIT 1",
                                  (user_id,user_id)).fetchone()
            c.execute("UPDATE collection_users SET active_owner_id=? WHERE user_id=? AND active_owner_id=?",
                      (replacement["owner_id"] if replacement else None,user_id,owner))
        return gone

def remove_editor(owner,actor,member_id):
    if not is_owner(actor,owner) or member_id==owner:
        return False
    return leave(member_id,owner)

def revoke_invites(owner,actor):
    if not is_owner(actor,owner):
        return False
    with db.connect() as c:
        c.execute("""UPDATE collection_invites SET revoked_at=?
                     WHERE owner_id=? AND redeemed_at IS NULL AND revoked_at IS NULL""",
                  (utc_now().isoformat(),owner))
    return True

class TenantMiddleware(BaseMiddleware):
    async def __call__(self,handler,event,data):
        actor=None
        if event.message and event.message.from_user:
            actor=event.message.from_user
        elif event.callback_query and event.callback_query.from_user:
            actor=event.callback_query.from_user
        token=ACTOR.set(actor.id if actor else None)
        try:
            if actor:
                source = event.message or event.callback_query
                chat = getattr(source, 'chat', None) or getattr(getattr(source, 'message', None), 'chat', None)
                if chat is not None and chat.type != 'private':
                    if event.callback_query:
                        await event.callback_query.answer('Открой бота в личном чате')
                    return None
                touch_user(actor.id,actor.full_name)
            return await handler(event,data)
        finally:
            ACTOR.reset(token)

class JoinCode(StatesGroup):
    typing=State()

class RenameCollection(StatesGroup):
    typing=State()

def ui():
    import bot
    return bot

def keyboard(*rows):
    return ui().kb(*rows)

async def edit(c,text,*rows):
    await rich_ui.edit_screen(c.message,text,parse_mode="HTML",reply_markup=keyboard(*rows))
    await c.answer()

async def welcome(m):
    await rich_ui.send_screen(m,
        "🦎 <b>ЭКЗОТЕКА</b>\n━━━━━━━━━━━━━━\n"
        "Удобный журнал ухода за экзотическими животными.\n\n"
        "Создай свою коллекцию или подключись к коллекции семьи.\n"
        "Без разрешения владельца чужие карточки недоступны.",
        parse_mode="HTML",
        reply_markup=keyboard(
            [("➕ Создать свою коллекцию","family:create","success")],
            [("🔗 Присоединиться по приглашению","family:join")],
        ))

async def directory(c):
    user=c.from_user.id
    owner=active_owner(user)
    rows=memberships(user)
    text=["👥 <b>МОИ КОЛЛЕКЦИИ</b>","━━━━━━━━━━━━━━"]
    for row in rows:
        sign="✅" if owner==row["owner_id"] else "▫️"
        label="Моя" if row["role"]=="owner" else "Общая"
        text.append(f"{sign} {label}: <b>{html.escape(row['title'])}</b> — {row['pet_count']} животных")
    if not rows:
        text.append("Пока нет коллекций.")
    buttons=[]
    for row in rows:
        buttons.append([(f"{'✅' if owner==row['owner_id'] else '↪️'} {row['title'][:18]} · {row['pet_count']}",
                         f"family:switch:{row['owner_id']}")])
    if not owns_collection(user):
        buttons.append([("➕ Создать свою коллекцию","family:create")])
    buttons.extend([
        [("🔗 Присоединиться по приглашению","family:join")],
        [("👥 Участники и приглашения","family:members")] if owner else [],
        [("🏠 Главное меню","menu:home")] if owner else []
    ])
    buttons=[b for b in buttons if b]
    await edit(c,"\n".join(text),*buttons)

async def people(c):
    user=c.from_user.id
    owner=active_owner(user)
    if not owner:
        return await directory(c)
    people=members(owner)
    lines=["👥 <b>УЧАСТНИКИ КОЛЛЕКЦИИ</b>","━━━━━━━━━━━━━━",
           f"🐾 Животных: {len(db.pets(owner))}","",
           "👑 Владелец управляет приглашениями и доступом."]
    for item in people:
        lines.append(f"{'👑' if item['role']=='owner' else '✏️'} {html.escape(item['display_name'] or 'Участник')}")
    rows=[]
    if is_owner(user,owner):
        rows.append([("🔗 Пригласить человека","family:invite","success")])
        rows.append([("✏️ Название коллекции","family:rename")])
        for item in people:
            if item["role"]!="owner":
                rows.append([(f"🚫 {str(item['display_name'] or 'Участник')[:18]}",f"family:kick:{item['user_id']}","danger")])
        rows.append([("⛔ Закрыть старые приглашения","family:revoke")])
    else:
        rows.append([("🚪 Покинуть коллекцию","family:leave","danger")])
    rows.append([("⬅️ Мои коллекции","family:list")])
    await edit(c,"\n".join(lines),*rows)

async def preview(c,code):
    info=invitation(code)
    if not info:
        await edit(c,"⚠️ <b>Приглашение недействительно.</b>\n"
                   "Возможно, срок истёк или ссылка уже использована.",
                   [("🔗 Другой код","family:join")],
                   [("⬅️ Мои коллекции","family:list")])
        return
    await edit(c,"🔗 <b>ПРИГЛАШЕНИЕ В КОЛЛЕКЦИЮ</b>\n━━━━━━━━━━━━━━\n"
               f"<b>{html.escape(info['title'])}</b>\n"
               "Ты получишь доступ к карточкам и сможешь редактировать их, "
               "отмечать кормления и менять графики.\n"
               "Твоя собственная коллекция, если есть, сохранится.",
               [("✅ Подключиться",f"family:accept:{code}","success")],
               [("⬅️ Отмена","family:list")])

@router.callback_query(F.data.startswith("family:"))
async def callback(c:CallbackQuery,state:FSMContext):
    user=c.from_user.id
    parts=c.data.split(":")
    action=parts[1] if len(parts)>1 else ""
    owner=active_owner(user)
    if action=="create":
        await state.clear()
        create_own(user)
        return await edit(c,"✅ <b>Коллекция создана</b>\n"
                 "Теперь можно добавлять животных и приглашать близких.",
                 [("🐾 Мои питомцы","menu:pets")],
                 [("👥 Доступ и приглашения","family:members")],
                 [("🏠 Главное меню","menu:home")])
    if action=="list":
        await state.clear()
        return await directory(c)
    if action=="join":
        await state.set_state(JoinCode.typing)
        await state.update_data(screen_id=c.message.message_id)
        return await edit(c,"🔗 <b>ПОДКЛЮЧЕНИЕ</b>\n"
                  "Отправь код приглашения или ссылку от владельца коллекции.",
                  [("⬅️ Мои коллекции","family:list")])
    if action=="preview" and len(parts)==3:
        await state.clear()
        return await preview(c,parts[2])
    if action=="accept" and len(parts)==3:
        await state.clear()
        joined=accept(parts[2],user)
        if not joined:
            return await edit(c,"⚠️ Ссылка недействительна или уже использована.",
                   [("⬅️ Коллекции","family:list")])
        return await edit(c,"✅ <b>Ты присоединился к коллекции!</b>\n"
                     "Теперь у вас общие карточки и история кормлений.",
                     [("🏠 Открыть коллекцию","menu:home","success")],
                     [("👥 Мои коллекции","family:list")])
    if action=="switch" and len(parts)==3:
        await state.clear()
        if not set_active(user,int(parts[2])):
            await c.answer("Нет доступа к этой коллекции",show_alert=True)
            return
        return await edit(c,"✅ <b>Активная коллекция изменена</b>\n"
                       "Все операции теперь относятся только к выбранной коллекции.",
                       [("🏠 Открыть","menu:home","primary")],
                       [("👥 Мои коллекции","family:list")])
    if action=="members":
        await state.clear()
        return await people(c)
    if action=="rename":
        if not owner or not is_owner(user,owner):
            await c.answer("Название меняет владелец",show_alert=True)
            return
        await state.set_state(RenameCollection.typing)
        await state.update_data(screen_id=c.message.message_id, owner=owner)
        return await edit(c,"✏️ <b>НАЗВАНИЕ КОЛЛЕКЦИИ</b>\n"
                   "Отправь название (до 48 символов).\n"
                   "Например: <i>Наши рептилии</i>.",
                   [("⬅️ Участники","family:members")])
    if action=="invite":
        if not owner or not is_owner(user,owner):
            await c.answer("Приглашения создаёт владелец",show_alert=True)
            return
        code,link=invite_link(owner,user)
        from aiogram.types import InlineKeyboardMarkup,InlineKeyboardButton
        markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔗 Открыть ссылку",url=link)],
            [InlineKeyboardButton(text="👥 Участники",callback_data="family:members")],
            [InlineKeyboardButton(text="🏠 Главное меню",callback_data="menu:home")]
        ])
        text=("🔗 <b>ГОТОВО: ПРИГЛАШЕНИЕ</b>\n━━━━━━━━━━━━━━\n"
              "Перешли ссылку человеку, который помогает ухаживать за животными.\n"
              f"<code>{link}</code>\n\n"
              "⏱ Действует 48 часов и только для одного подключения.\n"
              "✏️ Участник сможет изменять карточки и кормления.\n"
              "Владелец сможет отключить его доступ.")
        await rich_ui.edit_screen(c.message,text,parse_mode="HTML",reply_markup=markup)
        await c.answer()
        return
    if action=="revoke" and owner and is_owner(user,owner):
        revoke_invites(owner,user)
        return await edit(c,"⛔ Все неиспользованные приглашения отозваны.",
                          [("👥 Участники","family:members")])
    if action=="kick" and len(parts)==3 and owner and is_owner(user,owner):
        other=int(parts[2])
        if not any(m["user_id"]==other and m["role"]=="editor" for m in members(owner)):
            await c.answer("Участник не найден",show_alert=True)
            return
        return await edit(c,"⚠️ <b>Отключить доступ участнику?</b>\n"
                          "История животных останется в коллекции.",
                          [("🚫 Да, отключить",f"family:kickok:{other}","danger")],
                          [("⬅️ Отмена","family:members")])
    if action=="kickok" and len(parts)==3 and owner and is_owner(user,owner):
        removed=remove_editor(owner,user,int(parts[2]))
        return await edit(c,"✅ Доступ отключён." if removed else "Участник не найден.",
                          [("👥 Участники","family:members")])
    if action=="leave" and owner and not is_owner(user,owner):
        return await edit(c,"⚠️ Покинуть общую коллекцию?\n"
                         "Животные и история останутся у владельца.",
                         [("🚪 Покинуть",f"family:leaveok:{owner}","danger")],
                         [("⬅️ Отмена","family:members")])
    if action=="leaveok" and len(parts)==3:
        await state.clear()
        if leave(user,int(parts[2])):
            return await edit(c,"✅ Ты вышел из общей коллекции.",
                             [("👥 Мои коллекции","family:list")])
    await c.answer("Действие недоступно",show_alert=True)

@router.message(CommandStart())
async def restart(m: Message, state: FSMContext):
    await state.clear()
    return await ui().start(m)

@router.message(RenameCollection.typing,F.text)
async def renamed(m:Message,state:FSMContext):
    info=await state.get_data()
    await state.clear()
    title=(m.text or "").strip()
    success=rename(info["owner"],m.from_user.id,title)
    try: await m.delete()
    except Exception: pass
    text=("✅ <b>Название изменено</b>\n"+html.escape(title)) if success else "⚠️ Нужны 1–48 символов и права владельца."
    controls=keyboard([("👥 Участники","family:members")],[("🏠 Главное меню","menu:home")])
    try:
        await rich_ui.edit_by_id(m.bot,m.chat.id,info["screen_id"],text,parse_mode="HTML",reply_markup=controls)
    except Exception:
        await rich_ui.send_screen(m,text,parse_mode="HTML",reply_markup=controls)

@router.message(RenameCollection.typing)
async def rename_wrong(m:Message):
    await m.answer("Отправь название текстом.")

@router.message(JoinCode.typing,F.text)
async def entered(m:Message,state:FSMContext):
    text=m.text.strip()
    code=text.split("join_",1)[1].split("&",1)[0] if "join_" in text else text
    code=code.strip()
    ctx=await state.get_data()
    await state.clear()
    try: await m.delete()
    except Exception: pass
    class Screen:
        from_user=m.from_user
        message=type("M",(),{"chat":m.chat,"message_id":ctx.get("screen_id")})()
        async def answer(self,*args,**kwargs): pass
    c=Screen()
    info=invitation(code)
    if not info:
        text="⚠️ Приглашение недействительно или срок действия истёк."
        rows=[[("🔗 Попробовать снова","family:join")],[("👥 Мои коллекции","family:list")]]
    else:
        text="🔗 <b>Подключиться к общей коллекции?</b>\n" + "У тебя будут права на изменение карточек и кормлений."
        rows=[[("✅ Подключиться",f"family:accept:{code}","success")],
              [("⬅️ Отмена","family:list")]]
    try:
        await rich_ui.edit_by_id(m.bot,m.chat.id,ctx["screen_id"],text,parse_mode="HTML",
                                 reply_markup=keyboard(*rows))
    except Exception:
        await rich_ui.send_screen(m,text,parse_mode="HTML",reply_markup=keyboard(*rows))

@router.message(JoinCode.typing)
async def wrong(m:Message):
    await m.answer("Пришли текстовый код или ссылку приглашения.")
