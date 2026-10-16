"""Settings hub and animal feeding periods.

Main -> Settings -> Family and collections. Feeding periods stay under Pets.
Screens are edited in place, with classic Telegram fallback via rich_ui.
"""
from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
import db
import rich_ui

router = Router()
SOURCES = {"list", "card", "edit"}
MAX_DAYS = 3650


class PeriodInput(StatesGroup):
    days = State()


def app():
    import bot
    return bot


def board(*rows):
    return app().kb(*rows)


def interval_label(p):
    return f"{p['interval_days']} дн." if p['interval_days'] else "—"


def due_label(p):
    due = db.next_feed_date(p)
    return due.strftime("%d.%m.%Y") if due else "—"


def source_of(value):
    return value if value in SOURCES else "list"


def back_button(pet_id, source):
    source = source_of(source)
    if source == "card":
        return ("⬅️ К карточке", f"pet:{pet_id}")
    if source == "edit":
        return ("⬅️ К редактированию", f"manage:edit:{pet_id}")
    return ("⬅️ Все периоды", "settings:feeding")


async def show(c: CallbackQuery, text: str, *rows):
    await rich_ui.edit_screen(
        c.message, text, parse_mode="HTML", reply_markup=board(*rows))
    await c.answer()


async def settings_home(c: CallbackQuery):
    await show(c,
        "⚙️ <b>НАСТРОЙКИ</b>\n"
        "━━━━━━━━━━━━━━\n"
        "Здесь можно управлять общими коллекциями и доступом семьи.",
        [("👥 Семья и коллекции", "family:list")],
        [("⬅️ Главное меню", "menu:home")])


async def list_periods(c: CallbackQuery):
    animals = db.pets(app().owner_id())
    configured = sum(p['interval_days'] is not None for p in animals)
    text = (
        "🍽 <b>ПЕРИОДЫ КОРМЛЕНИЯ</b>\n"
        "━━━━━━━━━━━━━━\n"
        f"🐾 Питомцев: <b>{len(animals)}</b>\n"
        f"✅ Настроено: <b>{configured}</b> · ⚪ Без графика: <b>{len(animals)-configured}</b>\n\n"
        "Нажми на животное и введи число дней."
    )
    if not animals:
        text += "\nПитомцев пока нет."
    rows = []
    # One button per animal. No repeated list of names in the message.
    for index in range(0, len(animals), 2):
        row = []
        for p in animals[index:index+2]:
            icon = app().animal_emoji(p)
            name = p['name'] if len(p['name']) <= 14 else p['name'][:13] + "…"
            row.append((
                f"{icon} {name} · {interval_label(p)}",
                f"settings:pet:{p['id']}:list"
            ))
        rows.append(row)
    if not animals:
        rows.append([("➕ Добавить питомца", "manage:add")])
    rows.append([("⬅️ Мои питомцы", "menu:pets")])
    rows.append([("🏠 Главное меню", "menu:home")])
    await show(c, text, *rows)


async def period_screen(c: CallbackQuery, state: FSMContext, pet_id: int, source: str):
    source = source_of(source)
    p = db.pet_by_id(pet_id, app().owner_id())
    if p is None:
        await state.clear()
        await c.answer("Карточка недоступна", show_alert=True)
        return
    last = db.last_fed(pet_id)
    last_label = last.astimezone(app().TZ).strftime("%d.%m.%Y") if last else "—"
    await state.set_state(PeriodInput.days)
    await state.update_data(
        pet_id=pet_id, source=source, screen_id=c.message.message_id)
    text = (
        f"{app().animal_emoji(p)} <b>{app().safe(p['name'])}</b>\n"
        "━━━━━━━━━━━━━━\n"
        f"🔁 Период: <b>{interval_label(p)}</b>\n"
        f"🕘 Кормили: <b>{last_label}</b>\n"
        f"📅 Следующее: <b>{due_label(p)}</b>\n\n"
        "✏️ <b>Введи количество дней между кормлениями.</b>\n"
        "Например, отправь <code>9</code>."
    )
    rows = []
    if p['interval_days'] is not None:
        rows.append([("🚫 Убрать график", f"settings:clear:{pet_id}:{source}")])
    rows.append([back_button(pet_id, source)])
    rows.append([("🏠 Главное меню", "menu:home")])
    await show(c, text, *rows)


async def deleted_period(c: CallbackQuery, pet_id: int, source: str):
    p = db.pet_by_id(pet_id, app().owner_id())
    if p is None:
        await c.answer("Карточка недоступна", show_alert=True)
        return
    source = source_of(source)
    await show(c,
        f"🚫 <b>Убрать график: {app().safe(p['name'])}?</b>\n"
        "Записи кормлений сохранятся.\n"
        "Следующая дата перестанет рассчитываться.",
        [("🚫 Убрать период", f"settings:clearok:{pet_id}:{source}", "danger")],
        [("⬅️ Отмена", f"settings:pet:{pet_id}:{source}")])


async def result_screen(c: CallbackQuery, pet_id: int, source: str, cleared: bool):
    p = db.pet_by_id(pet_id, app().owner_id())
    if p is None:
        await c.answer("Карточка недоступна", show_alert=True)
        return
    caption = (
        "✅ <b>График убран</b>" if cleared
        else "✅ <b>Период сохранён</b>"
    )
    await show(c,
        f"{caption}\n"
        f"{app().animal_emoji(p)} <b>{app().safe(p['name'])}</b>\n"
        f"🔁 Период: <b>{interval_label(p)}</b>\n"
        f"📅 Следующее: <b>{due_label(p)}</b>",
        [("✏️ Изменить снова", f"settings:pet:{pet_id}:{source}")],
        [back_button(pet_id, source)],
        [("🏠 Главное меню", "menu:home")])


@router.callback_query(F.data.startswith("settings:"))
async def handle(c: CallbackQuery, state: FSMContext):
    if not app().allowed(c.from_user.id):
        await c.answer("Нет доступа", show_alert=True)
        return
    parts = (c.data or "").split(":")
    action = parts[1] if len(parts)>1 else ""
    if action == "home":
        await state.clear()
        # Old Telegram message compatibility: the former settings screen is gone.
        from management import menu
        return await menu(c)
    if action == "feeding":
        await state.clear()
        return await list_periods(c)
    if action in ("pet", "custom") and len(parts)>=3:
        pet_id = int(parts[2])
        source = source_of(parts[3] if len(parts)>=4 else "list")
        await state.clear()
        return await period_screen(c, state, pet_id, source)
    if action=="clear" and len(parts)>=3:
        old = await state.get_data()
        source = source_of(parts[3] if len(parts)>=4 else old.get("source","list"))
        await state.clear()
        return await deleted_period(c,int(parts[2]),source)
    if action=="clearok" and len(parts)>=3:
        pet_id=int(parts[2])
        source=source_of(parts[3] if len(parts)>=4 else "list")
        with db.connect() as conn:
            found=conn.execute(
                "UPDATE pets SET interval_days = NULL WHERE id=? AND owner_id=? AND archived_at IS NULL",
                (pet_id,app().owner_id())).rowcount == 1
        if not found:
            await c.answer("Карточка недоступна",show_alert=True)
            return
        await state.clear()
        return await result_screen(c,pet_id,source,cleared=True)
    # Compatibility with old preset buttons still visible in older messages.
    if action=="set" and len(parts)>=4:
        pet_id, days = int(parts[2]), int(parts[3])
        if not (1 <= days <= MAX_DAYS):
            await c.answer("Неверный период",show_alert=True)
            return
        if not db.set_interval(pet_id,app().owner_id(),days):
            await c.answer("Карточка недоступна",show_alert=True)
            return
        await state.clear()
        return await result_screen(c,pet_id,"list",cleared=False)
    await c.answer("Кнопка устарела. Открой /start.",show_alert=True)


@router.message(PeriodInput.days,F.text)
async def save_days(m: Message, state: FSMContext):
    if not app().allowed(m.from_user.id):
        return
    data=await state.get_data()
    pet_id=data.get("pet_id")
    source=source_of(data.get("source","list"))
    value=(m.text or "").strip()
    # The period is an integer, never a duration guessed from a date.
    valid=value.isascii() and value.isdecimal() and 1<=int(value)<=MAX_DAYS
    if not valid:
        # Do not create new help messages and lose the single-screen navigation.
        error="⚠️ Введи целое число от 1 до 3650 дней. Например: 9."
        try:
            await m.delete()
        except Exception:
            pass
        await rich_ui.edit_by_id(m.bot,m.chat.id,data["screen_id"],error,
            parse_mode="HTML",reply_markup=board(
                [back_button(pet_id,source)],
                [("🏠 Главное меню","menu:home")]))
        return
    if not db.set_interval(pet_id,app().owner_id(),int(value)):
        await state.clear()
        await m.answer("Карточка недоступна. Открой /start.")
        return
    await state.clear()
    try:
        await m.delete()
    except Exception:
        pass
    p=db.pet_by_id(pet_id,app().owner_id())
    if p is None:
        return
    result=(
        "✅ <b>Период сохранён</b>\n"
        f"{app().animal_emoji(p)} <b>{app().safe(p['name'])}</b>\n"
        f"🔁 Каждые: <b>{interval_label(p)}</b>\n"
        f"📅 Следующее: <b>{due_label(p)}</b>"
    )
    buttons=board(
        [("✏️ Изменить снова",f"settings:pet:{pet_id}:{source}")],
        [back_button(pet_id,source)],
        [("🏠 Главное меню","menu:home")])
    try:
        await rich_ui.edit_by_id(m.bot,m.chat.id,data["screen_id"],result,
                                 parse_mode="HTML",reply_markup=buttons)
    except Exception:
        # Message removed or older client: show a working navigation screen.
        await rich_ui.send_screen(m,result,parse_mode="HTML",reply_markup=buttons)


@router.message(PeriodInput.days)
async def wrong_type(m: Message, state: FSMContext):
    if not app().allowed(m.from_user.id):
        return
    data = await state.get_data()
    pet_id = data.get("pet_id")
    source = source_of(data.get("source", "list"))
    try:
        await m.delete()
    except Exception:
        pass
    if not pet_id or not data.get("screen_id"):
        return
    try:
        await rich_ui.edit_by_id(
            m.bot, m.chat.id, data["screen_id"],
            "⚠️ <b>Нужно отправить число дней текстом.</b>\n"
            "Например: <code>9</code>.",
            parse_mode="HTML",
            reply_markup=board(
                [back_button(pet_id, source)],
                [("🏠 Главное меню", "menu:home")]))
    except Exception:
        pass
