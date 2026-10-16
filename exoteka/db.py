import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
DB_FILE = BASE / 'data' / 'pets.sqlite3'
TZ = ZoneInfo('Europe/Moscow')

def connect():
    DB_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(DB_FILE, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    return db

def init_db():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS pets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          import_id INTEGER UNIQUE,
          owner_id INTEGER,
          name TEXT NOT NULL,
          species TEXT NOT NULL,
          hatched TEXT,
          acquired TEXT,
          sex TEXT,
          morph TEXT,
          interval_days INTEGER CHECK(interval_days BETWEEN 1 AND 3650),
          default_food TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS feeding (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          fed_at TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          voided_at TEXT
        );
        CREATE TABLE IF NOT EXISTS feed_confirmations (
          token TEXT PRIMARY KEY,
          pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
          owner_id INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS feeding_pet_active ON feeding(pet_id, fed_at DESC);
        ''')
        fields = {row['name'] for row in db.execute('PRAGMA table_info(feeding)')}
        if 'date_only' not in fields:
            db.execute('ALTER TABLE feeding ADD COLUMN date_only INTEGER NOT NULL DEFAULT 0')

def import_pets(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    imported = 0
    with connect() as db:
        for pet in data['pets']:
            cur = db.execute('''
              INSERT OR IGNORE INTO pets
                (import_id, name, species, hatched, acquired, sex, morph)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (pet['import_id'], pet['name'], pet['species'], pet['hatched'],
                  pet['acquired'], pet['sex'], pet['morph']))
            imported += cur.rowcount
    return imported

def bind_imported_pets(owner_id):
    with connect() as db:
        db.execute('UPDATE pets SET owner_id = ? WHERE owner_id IS NULL', (owner_id,))

def pets(owner_id):
    with connect() as db:
        return db.execute('SELECT * FROM pets WHERE owner_id = ? AND archived_at IS NULL ORDER BY id', (owner_id,)).fetchall()

def pet_by_id(pet_id, owner_id):
    with connect() as db:
        return db.execute('SELECT * FROM pets WHERE id = ? AND owner_id = ? AND archived_at IS NULL', (pet_id, owner_id)).fetchone()

def last_fed(pet_id):
    with connect() as db:
        row = db.execute('SELECT fed_at FROM feeding WHERE pet_id = ? AND voided_at IS NULL ORDER BY fed_at DESC, id DESC LIMIT 1', (pet_id,)).fetchone()
        return datetime.fromisoformat(row['fed_at']) if row else None

def feed_history(pet_id, limit=10):
    with connect() as db:
        return db.execute('SELECT * FROM feeding WHERE pet_id = ? AND voided_at IS NULL ORDER BY fed_at DESC, id DESC LIMIT ?', (pet_id, limit)).fetchall()

def set_interval(pet_id, owner_id, days):
    if not 1 <= days <= 3650:
        raise ValueError('Interval out of range')
    with connect() as db:
        return db.execute('UPDATE pets SET interval_days = ? WHERE id = ? AND owner_id = ?', (days, pet_id, owner_id)).rowcount == 1

def create_feed_confirmation(pet_id, owner_id):
    token = secrets.token_urlsafe(12)
    with connect() as db:
        db.execute('INSERT INTO feed_confirmations(token, pet_id, owner_id, created_at) VALUES (?, ?, ?, ?)',
                   (token, pet_id, owner_id, datetime.now(timezone.utc).isoformat()))
    return token

def confirm_feed(token, owner_id):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        pending = db.execute('''SELECT c.* FROM feed_confirmations c
          JOIN pets p ON p.id = c.pet_id
          WHERE c.token = ? AND c.owner_id = ? AND c.processed_at IS NULL AND p.owner_id = ? AND p.archived_at IS NULL''',
          (token, owner_id, owner_id)).fetchone()
        now = datetime.now(timezone.utc)
        if not pending or now - datetime.fromisoformat(pending['created_at']) > timedelta(minutes=15):
            return None
        db.execute('UPDATE feed_confirmations SET processed_at = ? WHERE token = ?', (now.isoformat(), token))
        event = db.execute('INSERT INTO feeding(pet_id, fed_at, recorded_at) VALUES (?, ?, ?)',
                           (pending['pet_id'], datetime.now(TZ).isoformat(), now.isoformat()))
        return event.lastrowid

def undo_feed(feed_id, owner_id):
    with connect() as db:
        return db.execute('''UPDATE feeding SET voided_at = ? WHERE id = ? AND voided_at IS NULL
          AND EXISTS (SELECT 1 FROM pets p WHERE p.id = feeding.pet_id AND p.owner_id = ?)''',
          (datetime.now(timezone.utc).isoformat(), feed_id, owner_id)).rowcount == 1

def feeding_pet(feed_id, owner_id):
    with connect() as db:
        return db.execute('''SELECT p.* FROM feeding f JOIN pets p ON f.pet_id = p.id
          WHERE f.id = ? AND p.owner_id = ?''', (feed_id, owner_id)).fetchone()

def next_feed_date(pet):
    last = last_fed(pet['id'])
    if not last or not pet['interval_days']:
        return None
    return last.date() + timedelta(days=pet['interval_days'])
