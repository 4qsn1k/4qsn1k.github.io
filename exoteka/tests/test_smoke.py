"""Isolated multi-user smoke test. Safe to run without a real bot token."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bot,db,pet_admin_db,tenancy,rich_ui

def main():
    previous=db.DB_FILE
    with TemporaryDirectory() as folder:
        db.DB_FILE=Path(folder)/"pets.sqlite3"
        try:
            db.init_db()
            pet_admin_db.migrate()
            rich_ui.init()
            tenancy.migrate()
            alice,bob,outsider=420001,420002,420003
            assert tenancy.active_owner(alice) is None
            tenancy.create_own(alice)
            first=pet_admin_db.create_pet(alice,"Pet A","Python regius",interval_days=7)
            assert db.pet_by_id(first,alice)
            tenancy.create_own(bob)
            other=pet_admin_db.create_pet(bob,"Pet B","Correlophus ciliatus")
            assert db.pet_by_id(other,alice) is None
            assert not pet_admin_db.archive_pet(first,bob)
            token,link=tenancy.invite_link(alice,alice)
            assert "join_" in link
            assert tenancy.accept(token,bob)==alice
            assert tenancy.accept(token,outsider) is None
            assert tenancy.active_owner(bob)==alice
            assert db.pet_by_id(first,tenancy.active_owner(bob))
            assert db.pet_by_id(other,tenancy.active_owner(bob)) is None
            assert tenancy.set_active(bob,bob)
            assert db.pet_by_id(other,tenancy.active_owner(bob))
            context=tenancy.ACTOR.set(alice)
            try:
                rich=rich_ui.prepare(bot.home_text(),bot.home_kb(),owner=alice,tz=bot.TZ)
                assert any(b.type.value=="table" for b in rich.blocks)
            finally:
                tenancy.ACTOR.reset(context)
            token2,_=tenancy.invite_link(alice,alice)
            assert tenancy.revoke_invites(alice,alice)
            assert tenancy.accept(token2,outsider) is None
            assert tenancy.remove_editor(alice,alice,bob)
            assert not tenancy.is_member(bob,alice)
            assert tenancy.active_owner(bob)==bob
            print("SMOKE_OK: separate users, pets, invite, family, switch, revoke, Rich UI")
        finally:
            db.DB_FILE=previous

if __name__=="__main__":
    main()
