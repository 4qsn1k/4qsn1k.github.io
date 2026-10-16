"""Smoke tests on isolated SQLite, without private animal records."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bot,db,pet_admin_db,rich_ui

def run():
    saved=db.DB_FILE
    with TemporaryDirectory() as dirname:
        db.DB_FILE=Path(dirname)/"pets.sqlite3"
        try:
            db.init_db()
            pet_admin_db.migrate()
            rich_ui.init()
            fixture=Path(__file__).resolve().parents[1]/"pets_import.json"
            assert db.import_pets(fixture)==0
            bot.OWNER="42"
            pet_id=pet_admin_db.create_pet(42,"Test animal","Python regius",
                hatched="2024-01-01",sex="female",interval_days=7)
            assert db.pet_by_id(pet_id,42)
            assert pet_admin_db.edit_pet(pet_id,42,"morph","Test morph")
            token=db.create_feed_confirmation(pet_id,42)
            event=db.confirm_feed(token,42)
            assert event and db.confirm_feed(token,42) is None
            rich=rich_ui.prepare(bot.home_text(),bot.home_kb(),owner=42,tz=bot.TZ)
            assert any(x.type.value=="table" for x in rich.blocks)
            assert pet_admin_db.archive_pet(pet_id,42)
            assert len(db.pets(42))==0
            assert pet_admin_db.restore_pet(pet_id,42)
            assert db.undo_feed(event,42)
            print("SMOKE_OK: cards, confirmation, undo, archive, Rich UI")
        finally:
            db.DB_FILE=saved

if __name__=="__main__":
    run()
