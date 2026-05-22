# Phase 1 — Database Foundation (Detailed Implementation Plan)

## Overview

Set up SQLModel + async SQLAlchemy + Alembic. Create all data models, session management, CRUD service layer, and the initial migration.

---

## Step 1 — Dependencies

Add to `apps/api/pyproject.toml`:

```
sqlmodel>=0.0.22
alembic>=1.14.0
```

`sqlmodel` pulls in `sqlalchemy` and `pydantic` transitively. `psycopg[binary,pool]` is already present for async Postgres.

---

## Step 2 — Directory Structure

New files under `apps/api/src/api/`:

```
src/api/
├── db/
│   ├── __init__.py
│   ├── engine.py          # AsyncEngine + async_sessionmaker
│   ├── session.py          # FastAPI Depends(get_session)
│   └── models/
│       ├── __init__.py     # re-exports all models
│       ├── project.py
│       ├── test_scenario.py
│       ├── run.py
│       ├── feature_expectation.py
│       ├── test_case.py
│       └── agent_event.py
├── services/
│   ├── __init__.py
│   ├── project_service.py
│   ├── test_scenario_service.py
│   ├── run_service.py
│   ├── feature_expectation_service.py
│   ├── test_case_service.py
│   └── agent_event_service.py
├── schemas/
│   ├── __init__.py
│   ├── project.py          # ProjectCreate, ProjectUpdate, ProjectRead
│   ├── test_scenario.py
│   ├── run.py
│   ├── feature_expectation.py
│   ├── test_case.py
│   └── agent_event.py
```

Alembic directory at `apps/api/`:

```
apps/api/
├── alembic.ini
├── migrations/
│   ├── env.py
│   ├── script.mako
│   └── versions/
│       └── 0001_initial_schema.py
```

---

## Step 3 — Engine + Session

### `db/engine.py`

- Create `AsyncEngine` from `settings.database_url` using `create_async_engine`
- Configure pool: `pool_size=5`, `max_overflow=10`, `pool_pre_ping=True`
- Create `async_sessionmaker` bound to the engine with `expire_on_commit=False`
- Export an `init_db()` coroutine that can be called from `main.py` lifespan if needed

### `db/session.py`

- Single FastAPI dependency:

```python
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

- On normal exit: session auto-closes (no explicit commit — services handle that)
- On exception: session rolls back automatically

### Wire into `main.py`

- Import engine in `lifespan`, call `engine.dispose()` on shutdown alongside the existing pool close

---

## Step 4 — Models

All models use `SQLModel` with `table=True`. UUIDs as primary keys (`uuid4`). Timestamps via `datetime` with `server_default`.

### `project.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK, default `uuid4` |
| `name` | `str` | required, max 255 |
| `description` | `str` | required, text |
| `problem_statement` | `str` | required, text |
| `target_users` | `str \| None` | optional, text |
| `tech_stack` | `str \| None` | optional, text |
| `additional_context` | `str \| None` | optional, text |
| `created_at` | `datetime` | server default `now()` |
| `updated_at` | `datetime` | server default `now()`, onupdate `now()` |

Relationships: `test_scenarios` → list of `TestScenario`

### `test_scenario.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK |
| `project_id` | `UUID` | FK → `projects.id`, `ondelete=CASCADE` |
| `title` | `str` | required, max 255 |
| `feature_description` | `str` | required, text |
| `user_story` | `str` | required, text |
| `acceptance_criteria` | `str` | required, text |
| `status` | `str` | enum: `draft` / `in_progress` / `completed`, default `draft` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Relationships: `project` → `Project`, `runs` → list of `Run`

### `run.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK |
| `test_scenario_id` | `UUID` | FK → `test_scenarios.id`, `ondelete=CASCADE` |
| `thread_id` | `str` | LangGraph checkpoint thread ID, unique |
| `status` | `str` | enum: `pending` / `agent1_running` / `agent1_review` / `agent2_running` / `agent3_running` / `agent3_review` / `completed` / `failed` |
| `current_node` | `str \| None` | current graph node name |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Relationships: `test_scenario` → `TestScenario`, `feature_expectations` → list, `test_cases` → list, `agent_events` → list

### `feature_expectation.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK |
| `run_id` | `UUID` | FK → `runs.id`, `ondelete=CASCADE` |
| `version` | `int` | starts at 1, increments on each revision |
| `content` | `JSON` | the structured expectation document |
| `status` | `str` | enum: `draft` / `approved` / `rejected` |
| `feedback` | `str \| None` | human feedback text when rejected |
| `created_at` | `datetime` | |

Unique constraint: `(run_id, version)`

### `test_case.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK |
| `run_id` | `UUID` | FK → `runs.id`, `ondelete=CASCADE` |
| `version` | `int` | batch version (all test cases from one generation share a version) |
| `category` | `str` | enum: `happy` / `edge` / `corner` |
| `title` | `str` | max 255 |
| `description` | `str` | text |
| `preconditions` | `str \| None` | text |
| `steps` | `JSON` | ordered list of step objects |
| `expected_result` | `str` | text |
| `rationale` | `str \| None` | why this test case matters |
| `status` | `str` | enum: `draft` / `approved` / `rejected` |
| `feedback` | `str \| None` | |
| `created_at` | `datetime` | |

### `agent_event.py`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID` | PK |
| `run_id` | `UUID` | FK → `runs.id`, `ondelete=CASCADE` |
| `node_name` | `str` | which graph node emitted this |
| `event_type` | `str` | `node_start` / `node_end` / `llm_token` / `interrupt` / `feedback_received` / `status_change` / `error` |
| `payload` | `JSON \| None` | arbitrary event data |
| `created_at` | `datetime` | |

Index: `(run_id, created_at)` for efficient event streaming queries.

Append-only — no updates or deletes on this table.

---

## Step 5 — Schemas (Pydantic request/response models)

Separate from SQLModel table models to control what the API accepts and returns.

### `schemas/project.py`

```python
class ProjectCreate(BaseModel):
    name: str
    description: str
    problem_statement: str
    target_users: str | None = None
    tech_stack: str | None = None
    additional_context: str | None = None

class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    problem_statement: str | None = None
    target_users: str | None = None
    tech_stack: str | None = None
    additional_context: str | None = None

class ProjectRead(BaseModel):
    id: UUID
    name: str
    description: str
    problem_statement: str
    target_users: str | None
    tech_stack: str | None
    additional_context: str | None
    created_at: datetime
    updated_at: datetime
```

Same pattern for other entities — `*Create`, `*Update`, `*Read` variants.

---

## Step 6 — Service Layer

Each service module exports plain async functions that take `AsyncSession` as the first argument. No classes — keep it simple.

### Pattern for every service

```python
async def create(session: AsyncSession, data: CreateSchema) -> Model:
    obj = Model.model_validate(data)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj

async def get_by_id(session: AsyncSession, id: UUID) -> Model | None:
    return await session.get(Model, id)

async def list_all(session: AsyncSession, **filters) -> list[Model]:
    stmt = select(Model).where(...filters...).order_by(Model.created_at.desc())
    result = await session.exec(stmt)
    return list(result.all())

async def update(session: AsyncSession, id: UUID, data: UpdateSchema) -> Model | None:
    obj = await session.get(Model, id)
    if not obj:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj

async def delete(session: AsyncSession, id: UUID) -> bool:
    obj = await session.get(Model, id)
    if not obj:
        return False
    await session.delete(obj)
    await session.commit()
    return True
```

### Service-specific additions

| Service | Extra methods |
|---------|---------------|
| `test_scenario_service` | `list_by_project(session, project_id)` |
| `run_service` | `list_by_scenario(session, scenario_id)`, `update_status(session, id, status, current_node)` |
| `feature_expectation_service` | `get_latest_by_run(session, run_id)`, `create_next_version(session, run_id, content)` |
| `test_case_service` | `list_by_run_and_version(session, run_id, version)`, `bulk_create(session, run_id, version, cases)`, `bulk_update_status(session, ids, status)` |
| `agent_event_service` | `list_by_run(session, run_id, after_id=None)` — supports cursor-based pagination for SSE streaming |

---

## Step 7 — Alembic Setup

1. Run `alembic init --template async migrations` from `apps/api/`
2. Configure `alembic.ini` to read `DATABASE_URL` from env
3. Edit `migrations/env.py`:
   - Import all models from `api.db.models`
   - Set `target_metadata = SQLModel.metadata`
   - Use `run_async_migrations` with `connectable = create_async_engine(...)`
4. Generate migration: `alembic revision --autogenerate -m "initial schema"`
5. Verify the generated migration has all 6 tables, FKs, indexes, and constraints

---

## Step 8 — Wire Into `main.py` Lifespan

Update the existing `lifespan` in `main.py`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Existing checkpointer setup...
    checkpointer, pool = await create_checkpointer()
    app.state.checkpointer = checkpointer

    # New: store engine for cleanup
    from api.db.engine import engine
    app.state.db_engine = engine

    # ...existing graph setup...

    yield

    # Shutdown
    await pool.close()
    await engine.dispose()
```

No need to call `create_all` — Alembic handles schema creation.

---

## Implementation Order

```
Step 1: Add dependencies
  ↓
Step 2: Create directory structure (empty __init__.py files)
  ↓
Step 3: engine.py + session.py
  ↓
Step 4: All 6 model files
  ↓
Step 5: All schema files
  ↓
Step 6: All service files
  ↓
Step 7: Alembic init + first migration
  ↓
Step 8: Wire engine into main.py lifespan
```

Steps 4, 5, and 6 can be done model-by-model (project first, then test_scenario, etc.) rather than all at once, since each entity is self-contained except for FK references.

---

## Verification Checklist

- [x] `uv sync` installs new dependencies without errors
- [x] `alembic upgrade head` creates all 6 tables in Postgres
- [x] `alembic downgrade base` cleanly drops them
- [x] Service layer unit tests pass (create, read, update, delete for each entity)
- [x] `get_session` dependency works in a test FastAPI app
- [x] FK cascades work (deleting a project removes its scenarios, runs, etc.)
- [x] `agent_events` index on `(run_id, created_at)` exists
- [x] Unique constraint on `feature_expectations(run_id, version)` enforced