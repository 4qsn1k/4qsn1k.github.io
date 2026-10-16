"""Owner/editor management screens and one-message animal creation wizard."""
import logging
from datetime import date, datetime
from aiogram import F, Router, Bot
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
import db
import rich_ui
import pet_admin_db as adm

router = Router()
log = logging.getLogger(__name__)
DATE_FORMAT = "ДД.ММ.ГГГГ"
TEXT_STEPS = ("name", "species", "hatched", "acquired", "morph")
FIELD_NAMES = {
    "name": "Кличка",
    "species": "Вид (латинское название)",
    "hatched": "Дата рождения / вылупления",
    "acquired": "Дата приобретения",
    "sex": "Пол",
    "morph": "Морфа / генотип",
    "default_food": "Корм по умолчанию",
}
OPTIONAL_FIELDS = {"hatched", "acquired", "morph", "default_food"}

class NewPet(StatesGroup):
    text = State()
    sex = State()
    interval = State()
    review = State()

class EditPet(StatesGroup):
    text = State()

class PhotoPet(StatesGroup):
    photo = State()

def core():
    import bot
    return bot

def board(*rows):
    return core().kb(*rows)

async def show(c: CallbackQuery, text: str, *rows):
    await rich_ui.edit_screen(c.message, text, parse_mode="HTML", reply_markup=board(*rows))
    await c.answer()

async def change_screen(message: Message, state: FSMContext, text: str, *rows):
    data = await state.get_data()
    try:
        await message.delete()
    except Exception:
        pass
    try:
        await rich_ui.edit_by_id(message.bot, text=text, chat_id=message.chat.id,
             message_id=data["screen_id"], parse_mode="HTML", reply_markup=board(*rows))
    except Exception:
        sent = await message.answer(text, parse_mode="HTML", reply_markup=board(*rows))
        await state.update_data(screen_id=sent.message_id)

def parse_date(value):
    value = value.strip()
    if value in ("-", "—"):
        return None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError("Неверный формат. Укажи дату ДД.ММ.ГГГГ.")

def label_date(value):
    return datetime.fromisoformat(value).strftime("%d.%m.%Y") if value else "Не указана"

def step_prompt(field, error=""):
    intro = {
      "name": "Как зовут питомца?\nНапиши кличку одним сообщением.",
      "species": "Укажи вид животного.\nНапример: <i>Python regius</i>.",
      "hatched": f"Укажи дату вылупления ({DATE_FORMAT}).",
      "acquired": f"Укажи дату приобретения ({DATE_FORMAT}).",
      "morph": "Какая морфа или генотип?\nНапиши название.",
    }[field]
    return ("⚠️ " + error + "\n\n" if error else "") + (
        "🦎 <b>Новое животное</b>\n"
        "━━━━━━━━━━━━━━\n"
        f"<b>{FIELD_NAMES[field]}</b>\n\n{intro}"
    )

def step_buttons(field):
    if field in OPTIONAL_FIELDS:
        return [[("⏭ Пропустить", "manage:skip", "primary")],
                [("✖️ Отменить", "manage:abort", "danger")]]
    return [[("✖️ Отменить", "manage:abort", "danger")]]

async def advance_new(message: Message, state: FSMContext, field: str, error=""):
    await state.set_state(NewPet.text)
    await state.update_data(field=field)
    await change_screen(message, state, step_prompt(field, error), *step_buttons(field))

async def show_sex(message: Message, state: FSMContext):
    await state.set_state(NewPet.sex)
    await change_screen(message, state,
        "🦎 <b>Новое животное</b>\n━━━━━━━━━━━━━━\n<b>Пол</b>\nВыбери вариант:",
        [("♂ Самец", "manage:newsex:male", "primary"), ("♀ Самка", "manage:newsex:female", "primary")],
        [("❔ Не определён", "manage:newsex:none")],
        [("✖️ Отменить", "manage:abort", "danger")])

async def show_interval(c: CallbackQuery, state: FSMContext):
    await state.set_state(NewPet.interval)
    await show(c, "🦎 <b>Новое животное</b>\n━━━━━━━━━━━━━━\n"
          "🍽 <b>Как часто кормить?</b>\n"
          "Каждому питомцу можно назначить свой период.",
          [("3 дня", "manage:days:3"), ("5 дней", "manage:days:5"), ("7 дней", "manage:days:7")],
          [("10 дней", "manage:days:10"), ("14 дней", "manage:days:14"), ("21 день", "manage:days:21")],
          [("30 дней", "manage:days:30"), ("⏭ Позже", "manage:days:0")],
          [("✖️ Отменить", "manage:abort", "danger")])

async def review(c: CallbackQuery, state: FSMContext):
    await state.set_state(NewPet.review)
    info = await state.get_data()
    sex = {"male":"♂ Самец", "female":"♀ Самка"}.get(info.get("sex"), "❔ Не определён")
    text = ("🦎 <b>Проверка новой карточки</b>\n━━━━━━━━━━━━━━\n"
        f"🏷 <b>{core().safe(info.get('name'))}</b>\n"
        f"🔬 <i>{core().safe(info.get('species'))}</i>\n\n"
        f"🐣 Вылупление: <b>{label_date(info.get('hatched'))}</b>\n"
        f"🏡 Приобретение: <b>{label_date(info.get('acquired'))}</b>\n"
        f"⚧ Пол: <b>{sex}</b>\n"
        f"🧬 Морфа: <b>{core().safe(info.get('morph'))}</b>\n"
        f"🍽 Интервал: <b>{str(info.get('interval_days'))+' дн.' if info.get('interval_days') else 'Позже'}</b>\n\n"
        "Если всё правильно, сохрани карточку.")
    await show(c,text,[("✅ Сохранить", "manage:save", "success")],
        [("✖️ Отменить", "manage:abort", "danger")])

async def menu(c: CallbackQuery):
    owner = core().owner_id()
    active = db.pets(owner)
    old = adm.archived_pets(owner)
    await show(c, f"🛠 <b>Управление коллекцией</b>\n━━━━━━━━━━━━━━\n"
       f"🐾 Животных: <b>{len(active)}</b>\n"
       f"📦 В архиве: <b>{len(old)}</b>\n\n"
       "Создавай карточки, меняй сведения или переноси животное в архив.",
       [("➕ Добавить животное", "manage:add")],
       [("✏️ Редактировать", "manage:editlist"),
        ("📦 Убрать из коллекции", "manage:deletelist", "danger")],
       [("🗄 Архив и возврат", "manage:archive")],
       [("👥 Семья и коллекции", "family:list")],
       [("🏠 Главное меню", "menu:home")])

async def choose(c: CallbackQuery, purpose: str):
    title = "✏️ Редактирование" if purpose == "edit" else "📦 Убрать из коллекции"
    pets = db.pets(core().owner_id())
    if not pets:
        await show(c, f"{title}\n\nКарточек пока нет.",
                   [("➕ Добавить", "manage:add", "success")],
                   [("⬅️ Управление", "manage:home")])
        return
    buttons = [[(f"🐾 {p['name']}", f"manage:{purpose}:{p['id']}")] for p in pets]
    buttons.append([("⬅️ Управление", "manage:home")])
    await show(c, f"<b>{title}</b>\n━━━━━━━━━━━━━━\nВыбери питомца:", *buttons)

async def edit_menu(c: CallbackQuery, pet_id: int):
    p = db.pet_by_id(pet_id, core().owner_id())
    if not p:
        await c.answer("Карточка не найдена", show_alert=True)
        return
    await show(c, f"✏️ <b>Редактирование — {core().safe(p['name'])}</b>\n"
      "━━━━━━━━━━━━━━\nКакое поле изменить?",
      [("🏷 Кличка", f"manage:field:{pet_id}:name"),
       ("🔬 Вид", f"manage:field:{pet_id}:species")],
      [("🐣 Вылупление", f"manage:field:{pet_id}:hatched"),
       ("🏡 Приобретение", f"manage:field:{pet_id}:acquired")],
      [("⚧ Пол", f"manage:field:{pet_id}:sex"),
       ("🧬 Морфа", f"manage:field:{pet_id}:morph")],
      [("🍽 Тип корма", f"manage:field:{pet_id}:default_food"),
       ("🔁 Период", f"settings:pet:{pet_id}:edit")],
      [("📷 Фото", f"manage:photo:{pet_id}")],
      [("🐾 Карточка", f"pet:{pet_id}"),
       ("⬅️ Управление", "manage:home")])

@router.callback_query(F.data.startswith("manage:"))
async def handle(c: CallbackQuery, state: FSMContext):
    if not core().allowed(c.from_user.id):
        await c.answer("Нет доступа", show_alert=True)
        return
    parts = c.data.split(":")
    action = parts[1] if len(parts)>1 else ""
    owner = core().owner_id()
    if action == "home":
        await state.clear()
        return await menu(c)
    if action == "add":
        await state.clear()
        await state.set_state(NewPet.text)
        await state.update_data(field="name", screen_id=c.message.message_id)
        return await show(c, step_prompt("name"), *step_buttons("name"))
    if action == "abort":
        await state.clear()
        return await menu(c)
    if action == "editlist":
        await state.clear()
        return await choose(c,"edit")
    if action == "deletelist":
        await state.clear()
        return await choose(c,"delete")
    if action == "edit" and len(parts)==3:
        await state.clear()
        return await edit_menu(c,int(parts[2]))
    if action == "field" and len(parts)==4:
        pet_id, field=int(parts[2]),parts[3]
        if field not in FIELD_NAMES or not db.pet_by_id(pet_id,owner):
            return await c.answer("Карточка не найдена",show_alert=True)
        if field == "sex":
            return await show(c,"⚧ <b>Укажи пол</b>",
                [("♂ Самец",f"manage:sex:{pet_id}:male"),("♀ Самка",f"manage:sex:{pet_id}:female")],
                [("❔ Не определён",f"manage:sex:{pet_id}:none")],
                [("⬅️ Отмена",f"manage:edit:{pet_id}")])
        await state.clear()
        await state.set_state(EditPet.text)
        await state.update_data(pet_id=pet_id, field=field, screen_id=c.message.message_id)
        hint = "Дата ДД.ММ.ГГГГ" if field in ("hatched","acquired") else "Отправь новое значение сообщением"
        rows=[[("⏭ Очистить поле",f"manage:clear:{pet_id}:{field}")]] if field in OPTIONAL_FIELDS else []
        rows.append([("✖️ Отмена",f"manage:edit:{pet_id}")])
        return await show(c,f"✏️ <b>{FIELD_NAMES[field]}</b>\n━━━━━━━━━━━━━━\n{hint}",*rows)
    if action == "clear" and len(parts)==4:
        pet_id,field=int(parts[2]),parts[3]
        if field in OPTIONAL_FIELDS and adm.edit_pet(pet_id,owner,field,None):
            await state.clear()
            return await edit_menu(c,pet_id)
        return await c.answer("Не удалось очистить поле",show_alert=True)
    if action == "sex" and len(parts)==4:
        pet_id,value=int(parts[2]),parts[3]
        sex=None if value=="none" else value
        if sex not in (None,"male","female") or not adm.edit_pet(pet_id,owner,"sex",sex):
            return await c.answer("Не удалось обновить пол",show_alert=True)
        return await edit_menu(c,pet_id)
    if action == "delete" and len(parts)==3:
        pet_id=int(parts[2])
        p=db.pet_by_id(pet_id,owner)
        if not p:return await c.answer("Карточка не найдена",show_alert=True)
        return await show(c,
            f"📦 <b>Убрать {core().safe(p['name'])} из коллекции?</b>\n━━━━━━━━━━━━━━\n"
            "Карточка исчезнет из списка.\nИстория кормлений останется в архиве.\n"
            "Её можно восстановить в любой момент.",
            [("📦 Да, в архив",f"manage:deleteok:{pet_id}","danger")],
            [("✖️ Нет, оставить",f"manage:deletelist")])
    if action == "deleteok" and len(parts)==3:
        pet_id=int(parts[2])
        if not adm.archive_pet(pet_id,owner):
            return await c.answer("Уже удалено или нет доступа",show_alert=True)
        return await show(c,"✅ <b>Животное перенесено в архив</b>\nВсе записи сохранены.",
            [("↩️ Вернуть",f"manage:restore:{pet_id}","success")],
            [("🛠 Управление", "manage:home")])
    if action == "archive":
        animals=adm.archived_pets(owner)
        rows=[[(f"↩️ {p['name']}",f"manage:restore:{p['id']}")] for p in animals]
        rows.append([("⬅️ Управление","manage:home")])
        return await show(c,"🗄 <b>Архив питомцев</b>\n━━━━━━━━━━━━━━\n"
                          + (f"Сохранено: {len(animals)}. Нажми на имя для возврата." if animals else "Архив пуст."),
                          *rows)
    if action == "restore" and len(parts)==3:
        pet_id=int(parts[2])
        if not adm.restore_pet(pet_id,owner):
            return await c.answer("Уже восстановлено или нет доступа",show_alert=True)
        return await show(c,"✅ <b>Карточка восстановлена</b>\nИстория кормления на месте.",
              [("🐾 Открыть карточку",f"pet:{pet_id}","primary")],
              [("🛠 Управление","manage:home")])
    if action == "photo" and len(parts)==3:
        pet_id=int(parts[2])
        if not db.pet_by_id(pet_id,owner):return await c.answer("Карточка не найдена",show_alert=True)
        await state.clear()
        await state.set_state(PhotoPet.photo)
        await state.update_data(pet_id=pet_id,screen_id=c.message.message_id)
        return await show(c,"📷 <b>Фото питомца</b>\n━━━━━━━━━━━━━━\n"
              "Пришли фотографию одним сообщением. Она сохранится в карточке.",
              [("✖️ Отмена",f"manage:edit:{pet_id}")])
    if action == "newsex":
        if await state.get_state() != NewPet.sex.state:return await c.answer("Создание уже завершено",show_alert=True)
        sex=parts[2]
        if sex not in ("male","female","none"):return await c.answer("Некорректное значение",show_alert=True)
        await state.update_data(sex=None if sex=="none" else sex)
        await state.set_state(NewPet.text)
        await state.update_data(field="morph")
        return await show(c,step_prompt("morph"),*step_buttons("morph"))
    if action == "skip":
        if await state.get_state()!=NewPet.text.state:return await c.answer("Шаг уже завершён",show_alert=True)
        data=await state.get_data()
        field=data.get("field")
        if field not in OPTIONAL_FIELDS:return await c.answer("Пропуск невозможен",show_alert=True)
        await state.update_data(**{field:None})
        if field=="hatched":nxt="acquired"
        elif field=="acquired":
            await state.set_state(NewPet.sex)
            return await show(c,"⚧ <b>Пол животного</b>\n━━━━━━━━━━━━━━\nВыбери вариант:",
                [("♂ Самец","manage:newsex:male"),("♀ Самка","manage:newsex:female")],
                [("❔ Не определён","manage:newsex:none")],
                [("✖️ Отмена","manage:abort")])
        else:
            return await show_interval(c,state)
        await state.update_data(field=nxt)
        return await show(c,step_prompt(nxt),*step_buttons(nxt))
    if action == "days":
        if await state.get_state()!=NewPet.interval.state:return await c.answer("Шаг уже завершён",show_alert=True)
        days=int(parts[2])
        if days not in (0,3,5,7,10,14,21,30):return await c.answer("Некорректный период",show_alert=True)
        await state.update_data(interval_days=days or None)
        return await review(c,state)
    if action == "save":
        if await state.get_state()!=NewPet.review.state:return await c.answer("Карточка уже создана",show_alert=True)
        info=await state.get_data()
        pet_id=adm.create_pet(owner,info["name"],info["species"],
            info.get("hatched"),info.get("acquired"),info.get("sex"),info.get("morph"),
            info.get("interval_days"))
        await state.clear()
        p=db.pet_by_id(pet_id,owner)
        return await show(c,"✅ <b>Новое животное добавлено!</b>\n\n"+core().card(p),
            [("✏️ Редактировать",f"manage:edit:{pet_id}")],
            [("🐾 Мои питомцы","menu:pets"),("🛠 Управление","manage:home")])
    await c.answer("Кнопка недоступна",show_alert=True)

@router.message(NewPet.text, F.text)
async def new_text(message: Message, state: FSMContext):
    if not core().allowed(message.from_user.id):return
    info=await state.get_data()
    field=info.get("field")
    if field not in TEXT_STEPS:return
    val=message.text.strip()
    if field in ("hatched","acquired"):
        try: val=parse_date(val)
        except ValueError as e:return await advance_new(message,state,field,str(e))
        if val and date.fromisoformat(val)>date.today():
            return await advance_new(message,state,field,"Дата не может быть в будущем.")
    elif not val or len(val)>120:
        return await advance_new(message,state,field,"Введи от 1 до 120 символов.")
    await state.update_data(**{field:val})
    if field=="name":nxt="species"
    elif field=="species":nxt="hatched"
    elif field=="hatched":nxt="acquired"
    elif field=="acquired":
        return await show_sex(message,state)
    else:
        await state.set_state(NewPet.interval)
        info=await state.get_data()
        return await change_screen(message,state,
            "🍽 <b>Период кормления</b>\n━━━━━━━━━━━━━━\nВыбери индивидуальный интервал:",
            [("3 дня","manage:days:3"),("5 дней","manage:days:5"),("7 дней","manage:days:7")],
            [("10 дней","manage:days:10"),("14 дней","manage:days:14"),("21 день","manage:days:21")],
            [("30 дней","manage:days:30"),("⏭ Позже","manage:days:0")],
            [("✖️ Отменить","manage:abort")])
    await advance_new(message,state,nxt)

@router.message(EditPet.text, F.text)
async def edit_text(message: Message, state: FSMContext):
    if not core().allowed(message.from_user.id):return
    data=await state.get_data()
    pet_id,field=data["pet_id"],data["field"]
    val=message.text.strip()
    if field in ("hatched","acquired"):
        try:val=parse_date(val)
        except ValueError as e:return await change_screen(message,state,f"⚠️ {e}\nНапиши дату заново.",
           [("✖️ Отмена",f"manage:edit:{pet_id}")])
        if val and date.fromisoformat(val)>date.today():
            return await change_screen(message,state,"⚠️ Будущая дата не допускается. Попробуй снова.",
                [("✖️ Отмена",f"manage:edit:{pet_id}")])
    elif not 1<=len(val)<=120:
        return await change_screen(message,state,"⚠️ Введи от 1 до 120 символов.",
             [("✖️ Отмена",f"manage:edit:{pet_id}")])
    ok=adm.edit_pet(pet_id,core().owner_id(),field,val)
    await state.clear()
    if not ok:return await message.answer("Не удалось сохранить. Карточка недоступна.")
    try:await message.delete()
    except Exception:pass
    info=db.pet_by_id(pet_id,core().owner_id())
    try:
        await rich_ui.edit_by_id(message.bot, 
            text="✅ <b>Данные обновлены</b>\n\n"+core().card(info),
            chat_id=message.chat.id, message_id=data["screen_id"],
            parse_mode="HTML",reply_markup=core().pet_kb(info))
    except Exception:
        await message.answer("✅ <b>Данные обновлены</b>\n\n"+core().card(info),
            parse_mode="HTML",reply_markup=core().pet_kb(info))

@router.message(PhotoPet.photo, F.photo)
async def set_photo(message: Message, state: FSMContext):
    if not core().allowed(message.from_user.id):return
    info=await state.get_data()
    pet_id=info["pet_id"]
    if not adm.set_photo(pet_id,core().owner_id(),message.photo[-1].file_id):
        return await message.answer("Карточка не найдена.")
    await state.clear()
    try:await message.delete()
    except Exception:pass
    p=db.pet_by_id(pet_id,core().owner_id())
    text="✅ <b>Фото питомца добавлено</b>\n\n"+core().card(p)
    try:
        await rich_ui.edit_by_id(message.bot, chat_id=message.chat.id,
           message_id=info["screen_id"],text=text,parse_mode="HTML",
           reply_markup=core().pet_kb(p))
    except Exception:
        await message.answer(text,parse_mode="HTML",reply_markup=core().pet_kb(p))

@router.message(NewPet.text)
@router.message(EditPet.text)
@router.message(PhotoPet.photo)
async def wrong_type(message: Message):
    if core().allowed(message.from_user.id):
        await message.answer("Отправь текст для поля или фотографию для фото. Либо нажми «Отмена».")
