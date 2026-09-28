.PHONY: backend frontend dev docker-up docker-down lint test

# install backend deps into a local venv
backend-install:
	cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt

# run the fastapi dev server
backend:
	cd backend && .venv/Scripts/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# install frontend deps
frontend-install:
	cd frontend && npm install

# run the vite dev server
frontend:
	cd frontend && npm run dev

# run backend and frontend concurrently (posix shells)
dev:
	./start.sh

# run the full stack via docker compose
docker-up:
	docker compose up --build

docker-down:
	docker compose down

# lint both apps (ruff + eslint) -- the same checks CI runs
lint:
	cd backend && .venv/Scripts/python -m ruff check .
	cd frontend && npm run lint

# run both test suites with coverage -- the same checks CI runs
test:
	cd backend && .venv/Scripts/python -m pytest tests/ -v --cov=app --cov-report=term-missing
	cd frontend && npm run test:coverage
