# ─── Config ──────────────────────────────────────────────────────────────────
-include .env
export

# Local dev ports (override .env defaults where needed)
API_PORT       ?= 8001
WEB_PORT       ?= 3001
DB_PORT        ?= 5432
REDIS_PORT     ?= 6380

API_DIR        := apps/api
WEB_DIR        := apps/web

.DEFAULT_GOAL  := help

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' | sort

# ─── Install ──────────────────────────────────────────────────────────────────
.PHONY: install install-api install-web
install: install-api install-web ## Install all dependencies

install-api: ## Install Python dependencies (uv)
	cd $(API_DIR) && uv sync

install-web: ## Install Node dependencies (bun)
	cd $(WEB_DIR) && bun install

# ─── Dev (local, no Docker) ───────────────────────────────────────────────────
.PHONY: dev dev-api dev-web
dev: ## Start api + web dev servers concurrently (requires tmux or two terminals)
	@echo "Starting API on port $(API_PORT) and Web on port $(WEB_PORT)..."
	@$(MAKE) -j2 dev-api dev-web

dev-api: ## Start FastAPI dev server with hot-reload
	cd $(API_DIR) && \
	DATABASE_URL=postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(DB_PORT)/$(POSTGRES_DB) \
	REDIS_URL=redis://localhost:$(REDIS_PORT) \
	API_PORT=$(API_PORT) \
	uv run api dev --host 127.0.0.1 --port $(API_PORT)

dev-web: ## Start Next.js dev server (Turbopack)
	cd $(WEB_DIR) && \
	NEXT_PUBLIC_API_URL=http://localhost:$(API_PORT) \
	bun dev --port $(WEB_PORT)

# ─── Infra (Docker only postgres + redis) ────────────────────────────────────
.PHONY: infra infra-down
infra: ## Start only postgres + redis in Docker
	DB_PORT=$(DB_PORT) REDIS_PORT=$(REDIS_PORT) docker compose up -d postgres redis
	@echo "Waiting for postgres to be ready..."
	@until docker compose exec postgres pg_isready -U $(POSTGRES_USER) > /dev/null 2>&1; do sleep 1; done
	@echo "postgres ready."
	@echo "Waiting for redis to be ready..."
	@until docker compose exec redis redis-cli ping | grep -q PONG; do sleep 1; done
	@echo "redis ready."

infra-down: ## Stop postgres + redis containers
	docker compose stop postgres redis

# ─── Docker (full stack) ──────────────────────────────────────────────────────
.PHONY: up down logs ps build
up: ## Build and start all services via Docker Compose
	API_PORT=$(API_PORT) \
	CORS_ORIGINS=http://localhost:$(WEB_PORT) \
	docker compose up --build -d

down: ## Stop and remove all containers
	docker compose down

logs: ## Tail logs for all services (Ctrl+C to stop)
	docker compose logs -f

logs-api: ## Tail api logs
	docker compose logs -f api

logs-web: ## Tail web logs
	docker compose logs -f web

ps: ## Show running containers
	docker compose ps

build: ## Build Docker images without starting
	docker compose build

# ─── Lint / Format / Typecheck ───────────────────────────────────────────────
.PHONY: lint lint-api lint-web format typecheck
lint: lint-api lint-web ## Lint all code

lint-api: ## Ruff lint + format check (Python)
	cd $(API_DIR) && uv run ruff check . && uv run ruff format --check .

lint-web: ## ESLint (TypeScript/React)
	cd $(WEB_DIR) && bun lint

format: ## Auto-format all code
	cd $(API_DIR) && uv run ruff format .
	cd $(WEB_DIR) && bun format

typecheck: ## TypeScript type-check (web)
	cd $(WEB_DIR) && bun typecheck

# ─── Test ─────────────────────────────────────────────────────────────────────
.PHONY: test test-api
test: test-api ## Run all tests

test-api: ## Run Python tests (pytest)
	cd $(API_DIR) && uv run pytest

# ─── Clean ────────────────────────────────────────────────────────────────────
.PHONY: clean
clean: ## Remove build artefacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
