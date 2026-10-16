import asyncio
import html
import io
import os
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo
from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart
from aiogram.types import BufferedInputFile, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
import db
import rich_ui
import dashboard

TOKEN = os.getenv('BOT_TOKEN', '').strip()
OWNER = os.getenv('OWNER_TELEGRAM_ID', '').strip()
ADDITIONAL_USERS = {int(x.strip()) for x in os.getenv('ADDITIONAL_USER_IDS', '').split(',') if x.strip().isdecimal()}
ACTIVATION_CODE = os.getenv('ACTIVATION_CODE', '').strip()
OWNER_FILE = db.BASE / 'data' / 'owner.telegram_id'
TZ = ZoneInfo(os.getenv('BOT_TZ', 'Europe/Moscow'))
db.TZ = TZ

def kb(*rows):
    buttons = []
    for row in rows:
        buttons.append([
            InlineKeyboardButton(text=item[0], callback_data=item[1],
                                 **({'style': item[2]} if len(item) > 2 else {}))
            for item in row])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def safe(v):
    return html.escape(str(v)) if v not in (None, '') else 'Не указано'

def d(v):
    return datetime.fromisoformat(v).strftime('%d.%m.%Y') if v else 'Не указана'

def owner_id():
    if OWNER.isdecimal():
        return int(OWNER)
    if OWNER_FILE.is_file():
        value = OWNER_FILE.read_text(encoding='utf-8').strip()
        return int(value) if value.isdecimal() else None
    return None

def allowed(user_id):
    primary = owner_id()
    return primary is not None and (user_id == primary or user_id in ADDITIONAL_USERS)

def status(p):
    due = db.next_feed_date(p)
    if not p['interval_days']:
        return '⚪ Период кормления не задан'
    if due is None:
        return '⚪ Нет отметок кормления'
    delta = (datetime.now(TZ).date() - due).days
    if delta > 0: return f'🔴 Просрочено на {delta} дн.'
    if delta == 0: return '🟡 Сегодня'
    return f'🟢 Через {-delta} дн.'

def animal_emoji(p):
    name = p['species'].lower()
    if any(x in name for x in ('python', 'boa', 'pantherophis', 'lampropeltis', 'eryx', 'morelia')):
        return '🐍'
    if any(x in name for x in ('gecko', 'correlophus', 'eublepharis', 'pogona', 'anolis')):
        return '🦎'
    if any(x in name for x in ('brachypelma', 'grammostola', 'avicularia', 'poecilotheria')):
        return '🕷️'
    if any(x in name for x in ('scorpio', 'heterometrus', 'pandinus')):
        return '🦂'
    if any(x in name for x in ('rana', 'bombina', 'ceratophrys', 'dendrobates')):
        return '🐸'
    return '🐾'

def card(p):
    sex = {'male': '♂ Самец', 'female': '♀ Самка'}.get(p['sex'], '❔ Не определён')
    last = db.last_fed(p['id'])
    due = db.next_feed_date(p)
    photo = bool(p['photo_file_id'])
    return (
      f"{animal_emoji(p)} <b>{safe(p['name'])}</b>  ·  №{p['id']}\n"
      f"<i>{safe(p['species'])}</i>\n"
      "━━━━━━━━━━━━━━\n"
      "🪪 <b>ПАСПОРТ ПИТОМЦА</b>\n"
      f"🐣 Вылупление: <b>{d(p['hatched'])}</b>\n"
      f"🏡 Приобретение: <b>{d(p['acquired'])}</b>\n"
      f"⚧ Пол: <b>{sex}</b>\n"
      f"🧬 Морфа: <b>{safe(p['morph'])}</b>\n"
      f"📷 Фото: {'✅ Добавлено' if photo else 'Пока нет'}\n\n"
      "🍽 <b>КОРМЛЕНИЕ</b>\n"
      f"🔁 Каждые: <b>{str(p['interval_days']) + ' дн.' if p['interval_days'] else 'не задано'}</b>\n"
      f"🕘 Последний раз: <b>{last.astimezone(TZ).strftime('%d.%m.%Y') if last else 'нет записей'}</b>\n"
      f"📆 Следующий раз: <b>{due.strftime('%d.%m.%Y') if due else 'пока не рассчитано'}</b>\n"
      f"{status(p)}\n"
      "━━━━━━━━━━━━━━\n"
      "<i>Кормление фиксируется только после подтверждения.</i>"
    )

def pet_kb(p):
    i = p['id']
    return kb(
      [('🍽 Накормил', f'feed:{i}', 'primary')],
      [('📋 История кормлений', f'history:{i}'),
       ('🗓 Период', f'settings:pet:{i}:card')],
      [('✏️ Редактировать', f'manage:edit:{i}'),
       ('📷 Фото' if p['photo_file_id'] else '📸 Добавить фото',
        f'photo:{i}' if p['photo_file_id'] else f'manage:photo:{i}')],
      [('▦ QR-код', f'qr:{i}')],
      [('⬅️ Мои питомцы', 'menu:pets')],
      [('🏠 Главное меню', 'menu:home')])

def home_text():
    return dashboard.home_text(owner_id(), TZ)

def legacy_home_text_unused():
    animals = db.pets(owner_id())
    scheduled = sum(bool(p['interval_days']) for p in animals)
    overdue = sum(status(p).startswith('🔴') for p in animals)
    return (
      "🦎 <b>ЭКЗОТЕКА</b>\n"
      "<i>Коллекция экзотических питомцев</i>\n"
      "━━━━━━━━━━━━━━\n"
      f"🐾 Питомцев: <b>{len(animals)}</b>\n"
      f"🍽 Графиков кормления: <b>{scheduled}</b>\n"
      f"🔴 Просрочено: <b>{overdue}</b>\n\n"
      "Выбери раздел ниже 👇")

def home_kb():
    return kb(
      [('🍽 Накормил', 'menu:feeding', 'primary'),
       ('🔄 Обновить', 'menu:home')],
      [('🐾 Мои питомцы', 'menu:pets'),
       ('🛠 Управление', 'manage:home')])

async def start(message: Message):
    if owner_id() is None:
        await message.answer('🦎 ЭкзоТека\nДля первого запуска нужна команда активации владельца.')
        return
    if not allowed(message.from_user.id):
        await message.answer('🔒 Это личная коллекция. Доступ закрыт.')
        return
    parts = (message.text or '').split()
    if len(parts) == 2 and parts[1].startswith('pet_') and parts[1][4:].isdigit():
        p = db.pet_by_id(int(parts[1][4:]), owner_id())
        if p:
            await rich_ui.send_screen(message, card(p), parse_mode='HTML', reply_markup=pet_kb(p))
            return
    await rich_ui.send_screen(message, home_text(), parse_mode='HTML', reply_markup=home_kb())

async def classic_ui(message: Message):
    if not allowed(message.from_user.id):
        return
    rich_ui.set_mode(message.from_user.id, "classic")
    await message.answer("✅ Обычный интерфейс включён. Нажми /start.")

async def rich_ui_cmd(message: Message):
    if not allowed(message.from_user.id):
        return
    rich_ui.set_mode(message.from_user.id, "rich")
    await rich_ui.send_screen(message, home_text(),
        parse_mode="HTML", reply_markup=home_kb())

async def myid(message: Message):
    await message.answer(f'Ваш Telegram ID: {message.from_user.id}')

async def activate(message: Message):
    if owner_id() is not None:
        await message.answer('🔒 ЭкзоТека уже активирована.')
        return
    parts = (message.text or '').split()
    if len(parts) != 2 or not ACTIVATION_CODE or not secrets.compare_digest(parts[1], ACTIVATION_CODE):
        await message.answer('Неверный код активации.')
        return
    OWNER_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(str(OWNER_FILE), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(str(message.from_user.id) + '\n')
    db.bind_imported_pets(message.from_user.id)
    await message.answer('✅ ЭкзоТека активирована.\nВ коллекции: ' + str(len(db.pets(message.from_user.id))) + ' питомцев.\nНажми /start')

async def custom_period(message: Message):
    if not allowed(message.from_user.id): return
    args = (message.text or '').split()
    if len(args) != 3 or not args[1].isdigit() or not args[2].isdigit():
        await message.answer('Формат: /interval НОМЕР ДНИ, например /interval 1 9')
        return
    animal_id, days = map(int, args[1:])
    if not 1 <= days <= 3650:
        await message.answer('Укажите интервал от 1 до 3650 дней.')
        return
    if not db.set_interval(animal_id, owner_id(), days):
        await message.answer('Карточка не найдена.')
        return
    await message.answer(f'✅ Период: {days} дней.',
      reply_markup=kb([('🐾 Карточка', f'pet:{animal_id}')]))

async def click(c: CallbackQuery, bot: Bot, state):
    if not allowed(c.from_user.id):
        await c.answer('Нет доступа', show_alert=True)
        return
    data = c.data or ''
    if await state.get_state() is not None:
        await state.clear()
    try:
        if data == 'ui:switch':
            # Compatibility for old messages: removed from the visible UI.
            await rich_ui.edit_screen(c.message, home_text(), parse_mode='HTML', reply_markup=home_kb())
        elif data == 'menu:home':
            try:
                await rich_ui.edit_screen(c.message, home_text(), parse_mode='HTML', reply_markup=home_kb())
            except TelegramBadRequest as exc:
                if 'message is not modified' not in str(exc).lower():
                    raise
        elif data == 'menu:pets':
            animals = db.pets(owner_id())
            rows = []
            for start_index in range(0, len(animals), 2):
                rows.append([(f"{animal_emoji(p)} {p['name']}", f"pet:{p['id']}")
                             for p in animals[start_index:start_index+2]])
            rows.append([('🔁 Периоды кормления', 'settings:feeding'),
                         ('🛠 Управление', 'manage:home')])
            rows.append([('🏠 Главное меню', 'menu:home')])
            await rich_ui.edit_screen(c.message, 
                f"🐾 <b>МОИ ПИТОМЦЫ</b>\n━━━━━━━━━━━━━━\n"
                f"В коллекции: <b>{len(animals)}</b>\n"
                "Нажми на кличку для открытия паспорта.\n\n"
                "Период кормления можно изменить в карточке или в общем списке периодов.",
                parse_mode='HTML', reply_markup=kb(*rows))
        elif data == 'menu:feeding':
            summary, items = dashboard.feeding_text(owner_id(), TZ)
            rows = []
            for item in items:
                pet = item['pet']
                rows.append([
                    (f"🍽 {pet['name']}", f"feed:{pet['id']}"),
                    ("📋 Паспорт", f"pet:{pet['id']}")
                ])
            rows.append([
                ("🐾 Мои питомцы", "menu:pets"),
                ("🏠 Главная", "menu:home")
            ])
            await rich_ui.edit_screen(c.message, summary, parse_mode='HTML', reply_markup=kb(*rows))
        elif data.startswith('pet:'):
            animal_id = int(data.split(':')[1])
            p = db.pet_by_id(animal_id, owner_id())
            if not p:
                await c.answer('Карточка не найдена', show_alert=True)
                return
            await rich_ui.edit_screen(c.message, card(p), parse_mode='HTML', reply_markup=pet_kb(p))
        elif data.startswith('photo:'):
            animal_id = int(data.split(':')[1])
            p = db.pet_by_id(animal_id, owner_id())
            if not p or not p['photo_file_id']:
                await c.answer('Фото ещё не добавлено', show_alert=True)
                return
            await bot.send_photo(c.from_user.id, p['photo_file_id'],
                caption=f"📷 {p['name']} — {p['species']}",
                reply_markup=kb([('🐾 Карточка', f'pet:{animal_id}')]))
        elif data.startswith('feed:'):
            animal_id = int(data.split(':')[1])
            p = db.pet_by_id(animal_id, owner_id())
            if not p:
                await c.answer('Карточка не найдена', show_alert=True)
                return
            token = db.create_feed_confirmation(animal_id, owner_id())
            await rich_ui.edit_screen(c.message, 
                f"🍽 <b>Подтвердить кормление?</b>\n\n{safe(p['name'])}\n"
                f"{datetime.now(TZ).strftime('%d.%m.%Y %H:%M')}\n\n"
                "Запись пока не создана.", parse_mode='HTML',
                reply_markup=kb([('✅ Подтвердить кормление', f'yes:{token}', 'success')],
                                [('⬅️ Отмена', f'pet:{animal_id}')]))
        elif data.startswith('yes:'):
            event_id = db.confirm_feed(data.split(':',1)[1], owner_id())
            if event_id is None:
                await c.answer('Подтверждение уже использовано или истекло', show_alert=True)
                return
            p = db.feeding_pet(event_id, owner_id())
            due = db.next_feed_date(p)
            await rich_ui.edit_screen(c.message, 
                f"✅ <b>{safe(p['name'])} накормлен!</b> 😋\n"
                f"📅 {datetime.now(TZ).strftime('%d.%m.%Y %H:%M')}\n"
                f"Следующая: {due.strftime('%d.%m.%Y') if due else 'Период не задан'}",
                parse_mode='HTML', reply_markup=kb(
                    [('↩️ Отменить ошибочную запись', f'undo:{event_id}')],
                    [('🐾 Карточка', f'pet:{p["id"]}'), ('🍽 Кормёжка', 'menu:feeding')]))
        elif data.startswith('undo:'):
            event_id = int(data.split(':')[1])
            p = db.feeding_pet(event_id, owner_id())
            if not p or not db.undo_feed(event_id, owner_id()):
                await c.answer('Запись уже отменена', show_alert=True)
                return
            await rich_ui.edit_screen(c.message, f"↩️ Кормление {safe(p['name'])} отменено.",
                  parse_mode='HTML', reply_markup=kb([('🐾 Карточка', f'pet:{p["id"]}')]))
        elif data.startswith(('period:', 'set:')):
            # Old keyboards: route to the same numeric-input screen.
            import settings
            animal_id = int(data.split(':')[1])
            await settings.period_screen(c, state, animal_id, 'card')
        elif data.startswith('history:'):
            animal_id = int(data.split(':')[1])
            p = db.pet_by_id(animal_id, owner_id())
            if not p:
                await c.answer('Карточка не найдена', show_alert=True)
                return
            items = db.feed_history(animal_id)
            history = '\n'.join('✅ ' + datetime.fromisoformat(x['fed_at']).astimezone(TZ).strftime('%d.%m.%Y' if x['date_only'] else '%d.%m.%Y %H:%M') for x in items)
            await rich_ui.edit_screen(c.message, f"📋 <b>История: {safe(p['name'])}</b>\n\n{history or 'Пока пусто'}",
                parse_mode='HTML', reply_markup=kb([('⬅️ Карточка', f'pet:{animal_id}')]))
        elif data.startswith('qr:'):
            animal_id = int(data.split(':')[1])
            p = db.pet_by_id(animal_id, owner_id())
            if not p:
                await c.answer('Карточка не найдена', show_alert=True)
                return
            import qrcode
            me = await bot.get_me()
            png = io.BytesIO()
            qrcode.make(f'https://t.me/{me.username}?start=pet_{animal_id}').save(png, 'PNG')
            await bot.send_photo(c.from_user.id,
                BufferedInputFile(png.getvalue(), filename=f'pet-{animal_id}.png'),
                caption=f"▦ QR-код: {p['name']}\n"
                        "Доступ к закрытой карточке имеет только владелец.")
        else:
            await c.answer('Неизвестная кнопка', show_alert=True)
            return
        await c.answer()
    except (ValueError, IndexError):
        await c.answer('Некорректные данные', show_alert=True)

async def main():
    if not TOKEN or (owner_id() is None and not ACTIVATION_CODE):
        raise SystemExit('Set BOT_TOKEN and ACTIVATION_CODE before starting the bot')
    db.init_db()
    rich_ui.init()
    import pet_admin_db
    pet_admin_db.migrate()
    db.import_pets(db.BASE / 'pets_import.json')
    if owner_id() is not None:
        db.bind_imported_pets(owner_id())
    dp = Dispatcher()
    import management
    import settings
    dp.include_router(management.router)
    dp.include_router(settings.router)
    dp.message.register(myid, Command('id'))
    dp.message.register(classic_ui, Command('classic'))
    dp.message.register(rich_ui_cmd, Command('rich'))
    dp.message.register(activate, Command('activate'))
    dp.message.register(custom_period, Command('interval'))
    dp.message.register(start, CommandStart(deep_link=True))
    dp.message.register(start, CommandStart())
    from aiogram import F
    dp.callback_query.register(click, ~F.data.startswith('manage:'), ~F.data.startswith('settings:'))
    async with Bot(TOKEN) as bot:
        await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
