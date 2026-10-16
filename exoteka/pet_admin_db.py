"""Database functions for animal management. Archived pets remain recoverable."""
from datetime import datetime, timezone
import db

EDITABLE = {"name", "species", "hatched", "acquired", "sex", "morph", "default_food"}

def migrate():
    with db.connect() as c:
        columns = {row["name"] for row in c.execute("PRAGMA table_info(pets)")}
        if "archived_at" not in columns:
            c.execute("ALTER TABLE pets ADD COLUMN archived_at TEXT")
        if "photo_file_id" not in columns:
            c.execute("ALTER TABLE pets ADD COLUMN photo_file_id TEXT")

def create_pet(owner_id: int, name: str, species: str, hatched=None,
               acquired=None, sex=None, morph=None, interval_days=None):
    with db.connect() as c:
        cur = c.execute("""
            INSERT INTO pets (owner_id, name, species, hatched, acquired,
                              sex, morph, interval_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (owner_id, name, species, hatched, acquired, sex, morph, interval_days))
        return cur.lastrowid

def edit_pet(pet_id: int, owner_id: int, field: str, value):
    if field not in EDITABLE:
        raise ValueError("Invalid pet field")
    with db.connect() as c:
        return c.execute(
            f"UPDATE pets SET {field} = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL",
            (value, pet_id, owner_id)).rowcount == 1

def archive_pet(pet_id: int, owner_id: int):
    with db.connect() as c:
        return c.execute(
            "UPDATE pets SET archived_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL",
            (datetime.now(timezone.utc).isoformat(), pet_id, owner_id)).rowcount == 1

def restore_pet(pet_id: int, owner_id: int):
    with db.connect() as c:
        return c.execute(
            "UPDATE pets SET archived_at = NULL WHERE id = ? AND owner_id = ? AND archived_at IS NOT NULL",
            (pet_id, owner_id)).rowcount == 1

def archived_pets(owner_id: int):
    with db.connect() as c:
        return c.execute(
            "SELECT * FROM pets WHERE owner_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC",
            (owner_id,)).fetchall()

def archived_pet(pet_id: int, owner_id: int):
    with db.connect() as c:
        return c.execute(
            "SELECT * FROM pets WHERE id = ? AND owner_id = ? AND archived_at IS NOT NULL",
            (pet_id, owner_id)).fetchone()

def set_photo(pet_id: int, owner_id: int, file_id):
    with db.connect() as c:
        return c.execute(
            "UPDATE pets SET photo_file_id = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL",
            (file_id, pet_id, owner_id)).rowcount == 1
