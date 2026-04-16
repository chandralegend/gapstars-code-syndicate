# Customer Support Multi-Agent Platform

A multi-agent customer support system built with LangGraph's **supervisor pattern**. Three specialized agents collaborate to handle customer inquiries -- a Triage agent classifies intent and delegates to Order Support and Technical Support specialists.

## Architecture

```
User Message
     |
     v
┌─────────────┐
│   Triage    │  Classifies intent, handles FAQs,
│  (Supervisor)│  delegates to specialists
└──────┬──────┘
       |
  ┌────┴─────┐
  v          v
┌──────┐  ┌──────┐
│Order │  │ Tech │
│Support│  │Support│
└──────┘  └──────┘
```

- **Triage Agent** -- Front-line supervisor. Handles greetings, FAQs (return policy, shipping, warranty, etc.), and routes complex queries to the right specialist.
- **Order Support Agent** -- Handles order lookups, shipping status, returns/refunds, and order modifications.
- **Technical Support Agent** -- Handles product troubleshooting, account issues, password resets, and support ticket creation.

### Supervisor Pattern

The Triage agent always stays in control. When it needs to delegate, it calls `route_to_agent` which triggers a handoff node that cleans up the routing message before passing control to the specialist. Each specialist has its own ReAct tool loop and returns a final response.

### Graph Structure

```
START -> triage -> [triage_tools | handoff_to_order | handoff_to_tech | END]
                    triage_tools -> triage
                    handoff_to_order -> order_support -> [order_tools | END]
                    handoff_to_tech -> technical_support -> [tech_tools | END]
```

## Stack

| Layer | Technology |
|---|---|
| Agent framework | LangGraph (supervisor pattern) |
| Backend | FastAPI + Python 3.12 |
| Package manager | uv |
| CLI | Typer |
| Frontend | Next.js 16 + shadcn/ui |
| JS runtime | Bun |
| Database | PostgreSQL 16 (LangGraph checkpointer) |
| Cache | Redis 7 |
| Containers | Docker Compose |

## Project Structure

```
customer-support-multi-agent-platform/
├── apps/
│   ├── api/                        # FastAPI + LangGraph backend
│   │   └── src/api/
│   │       ├── agent/
│   │       │   ├── agents/         # Agent prompts (triage, order, tech)
│   │       │   ├── data/           # Mock databases (orders, products, accounts)
│   │       │   ├── tools/          # Agent tools (triage, order, technical)
│   │       │   ├── graph.py        # Supervisor multi-agent graph
│   │       │   ├── state.py        # AgentState with current_agent tracking
│   │       │   └── checkpointer.py # Postgres persistence
│   │       ├── routers/
│   │       │   └── agent.py        # /api/chat endpoints with agent SSE events
│   │       ├── config.py
│   │       └── main.py
│   └── web/                        # Next.js + shadcn/ui frontend
│       ├── components/chat/
│       │   ├── agent-badge.tsx     # Per-agent colored badges
│       │   ├── chat-interface.tsx
│       │   ├── message-input.tsx
│       │   └── message-list.tsx
│       ├── hooks/use-chat.ts       # Chat hook with agent tracking
│       └── lib/
│           ├── api.ts              # SSE client with agent event handling
│           └── types.ts            # AgentName type + display config
├── packages/                       # Shared packages (future use)
├── docker-compose.yml
└── .env.example
```

## Agent Tools

### Triage Agent

| Tool | Description |
|---|---|
| `lookup_faq` | Look up FAQs by topic (return policy, shipping, warranty, payments, etc.) |
| `route_to_agent` | Route conversation to a specialist agent |

### Order Support Agent

| Tool | Description |
|---|---|
| `lookup_order` | Retrieve full order details by order ID |
| `check_shipping_status` | Get shipping/tracking info for an order |
| `initiate_return` | Start a return for an eligible order |
| `modify_order` | Submit a modification request for a processing order |

### Technical Support Agent

| Tool | Description |
|---|---|
| `search_knowledge_base` | Find troubleshooting guides for product issues |
| `check_account_status` | Look up customer account details |
| `reset_password` | Send a password reset link |
| `create_support_ticket` | Escalate issues to human engineers |

## Mock Data

The system includes realistic mock data for demonstration:

- **5 orders** -- Various statuses (delivered, in transit, processing, cancelled)
- **5 products** -- With detailed troubleshooting guides (headphones, smart home hub, keyboard, speaker, webcam)
- **4 customer accounts** -- With different subscription tiers and account statuses

## Quick Start

### 1. Clone and configure environment

```bash
git clone https://github.com/Gapstars-Pvt-Ltd/customer-support-multi-agent-platform.git
cd customer-support-multi-agent-platform
cp .env.example .env
# Edit .env and set your OPENAI_API_KEY
```

### 2. Run with Docker Compose

```bash
docker compose up --build
```

- Web UI: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

### 3. Local development (without Docker)

**Backend:**

```bash
cd apps/api
uv sync
uv run api dev
```

**Frontend:**

```bash
cd apps/web
bun install
bun dev
```

> Make sure Postgres and Redis are running locally (or use `docker compose up postgres redis`).

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/chat` | Send message, get full response with agent name |
| POST | `/api/chat/stream` | Send message, stream response via SSE |

### SSE Event Types

The `/api/chat/stream` endpoint emits the following Server-Sent Events:

| Event | Data | Description |
|---|---|---|
| `agent` | `{"agent": "triage"}` | Active agent changed |
| `token` | `{"token": "Hello"}` | Partial text token from the model |
| `done` | `{"thread_id": "..."}` | Stream complete |
| `error` | `{"detail": "..."}` | Error occurred |

## Example Interactions

| User Message | Routing | Agent |
|---|---|---|
| "Hello, what can you help with?" | Direct response | Triage |
| "What's your return policy?" | FAQ lookup | Triage |
| "Where is my order ORD-1002?" | Delegates | Order Support |
| "I want to return order ORD-1001" | Delegates | Order Support |
| "My headphones won't turn on" | Delegates | Technical Support |
| "I forgot my password" | Delegates | Technical Support |

## Frontend Features

- **Agent badges** on each message showing which agent responded (color-coded)
- **Header badge** showing the currently active agent
- **Real-time streaming** with per-token updates via SSE
- **Agent switch indicators** during streaming
- **Dark/light theme** toggle (press `D`)
- **Persistent threads** -- conversations survive page reloads

## Environment Variables

See `.env.example` for all variables. Key settings:

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key (required) | -- |
| `OPENAI_MODEL` | Model to use | `gpt-4o-mini` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/multiagent` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API URL for the frontend | `http://localhost:8000` |
