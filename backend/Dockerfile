FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# the sqlite file lives on its own directory (the volume mount point in docker-compose.yml) so the
# save survives container recreation; created here too so a plain `docker run` works without a volume
RUN mkdir -p /app/data /app/audits
ENV DATABASE_URL=sqlite:////app/data/incidentzero.db \
    AUDITS_DIR=/app/audits

EXPOSE 8000

# python is already in the image (the slim base has no curl/wget)
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
