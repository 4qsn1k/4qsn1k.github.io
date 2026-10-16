FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot.py db.py management.py pet_admin_db.py settings.py dashboard.py rich_ui.py pets_import.json ./
CMD ["python", "bot.py"]
