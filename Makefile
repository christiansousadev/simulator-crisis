.PHONY: backend-install backend frontend-install frontend dev start docker-up docker-down lint test build e2e check

# the venv layout differs per OS: Scripts/ on Windows (Git Bash), bin/ everywhere else
VENV_BIN := $(shell if [ -d backend/.venv/Scripts ]; then echo Scripts; elif [ -d backend/.venv/bin ]; then echo bin; elif [ "$$OS" = "Windows_NT" ]; then echo Scripts; else echo bin; fi)
PY := .venv/$(VENV_BIN)/python

# install backend deps into a local venv
backend-install:
	cd backend && python -m venv .venv && $(PY) -m pip install -r requirements.txt

# run the fastapi dev server
backend:
	cd backend && $(PY) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# install frontend deps (reproducible, from package-lock.json)
frontend-install:
	cd frontend && npm ci

# run the vite dev server
frontend:
	cd frontend && npm run dev

# run backend and frontend concurrently (posix shells; falls back to :8010 when :8000 is busy)
dev:
	./start.sh

start: dev

# run the full stack via docker compose
docker-up:
	docker compose up --build

docker-down:
	docker compose down

# lint both apps (ruff + eslint) -- the same checks CI runs
lint:
	cd backend && $(PY) -m ruff check .
	cd frontend && npm run lint

# run both test suites with coverage -- the same checks CI runs
test:
	cd backend && $(PY) -m pytest tests/ -v --cov=app --cov-report=term-missing
	cd frontend && npx tsc --noEmit && npm run test:coverage

# production build of the frontend (typecheck + vite build)
build:
	cd frontend && npm run build

# real-browser end-to-end suite: starts its own backend (:8000) and vite (:5173) -- stop other
# servers on those ports first, and run `npx playwright install chromium` once
e2e:
	cd frontend && npm run test:e2e

# every gate CI runs, in one command (lint, typecheck, unit tests, build, e2e)
check: lint test build e2e
