from pathlib import Path
from db import init_db, import_pets, connect

init_db()
new = import_pets(Path(__file__).parent / 'pets_import.json')
with connect() as db:
    rows = db.execute('SELECT id, name, species, hatched, acquired FROM pets ORDER BY id').fetchall()
print(f'IMPORTED_NEW={new}; TOTAL={len(rows)}')
for r in rows:
    print(f"{r['id']:02d} | {r['name']} | {r['species']} | {r['hatched']} | {r['acquired']}")
