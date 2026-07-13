# QALoop — Presentation Plan

**Team:** Code Syndicate — Chandra, Risira, Sachintha
**Event:** Gapstars AI Hackathon — *"Implement a QA Test Automation tool"*
**Product:** QALoop
**Format:** 45 min total → **~15 min slides · ~20 min live demo · ~10 min Q&A**

**Design direction:** dark, minimal, "wow but simplistic".
- Primary theme color: `#842cff`
- Subtle animated background (soft gradient drift / light particle field) — never distracting
- Multi-color confetti bursts on key beats: title reveal, the "tests passed" demo moment, and the closing slide
- Single self-contained HTML file, keyboard arrow-key navigation

---

## Work-split mapping (baked into Slide 7)

| Phase | Owner | Scope |
|---|---|---|
| **Phase 1** | **Sachintha** | Backend + LangGraph agent orchestration, DB, the API contract layer |
| **Phase 2** | **Chandra** | Sandbox environment — Computer Use agent (Agent 2), Docker runner, noVNC |
| **Phase 3** | **Risira** | Next.js frontend — live SSE timeline, human-review gates |

> ⚠️ Confirm Phase 3 owner scope (frontend) before final build.

---

## Slide flow (13 slides)

### 1 — Title / Hook
- "QALoop — describe a feature in plain English, get a runnable test suite that actually ran."
- Team name + 3 names.
- Confetti burst on load. One-line tagline.

### 2 — The Problem (the brief we were given)
- Gapstars asked for a QA test automation tool.
- Real pain: writing & maintaining browser tests is slow, manual, and goes stale.
- Frame: *"What if QA was a conversation, not a codebase?"*

### 3 — Our Approach
The method, not the product:
1. Locked **high-level architecture first**
2. Wrote a shared **PLAN.md** as the contract
3. Sliced it into 3 independent phases so three people could build in parallel from hour zero

*(This is the "how we approached the topic" slide.)*

### 4 — What QALoop Is
- The 5-phase loop in one visual: **Brief → Sandbox Exploration → Test Cases → Test Scripts → Execution**
- Human approval gates between stages
- Emphasize the "loop" + human-in-the-loop

### 5 — High-Level Architecture
- Clean redraw of the README diagram:
  `web (Next.js + SSE)` → `api (FastAPI + LangGraph)` → `Postgres` + `claude-sandbox-svc` → `qa-sandbox Docker image (Chromium + pytest + noVNC)`
- Animate the data flow along the arrows

### 6 — The Agent Pipeline
- LangGraph state machine: the 4 agents + auto-triggered execution worker
- Call out the two human-review interrupts
- Shows it's real orchestration, not prompt-chaining

### 7 — How We Split the Work
- The 3-phase table above, one column per teammate, color-coded
- Point: clean seams = parallel work with no one blocked

### 8 — How It Merged
The integration story:
- **API contract written first** → frontend (Risira) never waited on backend
- **HITL placeholder for Agent 2** → Sachintha's orchestration ran end-to-end before Chandra's sandbox landed
- Final merge was fast because the seams were defined up front

*(This is the "how it got merged" slide.)*

### 9 — Issues We Faced
Three honest challenges:
- **Sandbox autonomy** — how do you give an agent a real browser to explore *and* extract decisions from what it sees? (Phase 2's hard problem)
- **4-hour clock** — full product in one sitting
- **Parallel integration risk** — three people, one codebase, no time for merge hell

### 10 — How We Overcame Them
Map each issue → solution:
- **Sandbox** → isolated Docker container w/ Chromium + noVNC + Computer Use; findings written to `findings.md`
- **Time** → architecture-first + PLAN.md let all three build simultaneously
- **Integration** → contract-first API + HITL placeholders as decoupling seams
- Punchline: *"The placeholder was the trick that kept everyone unblocked."*

### 11 — Live Demo (transition slide)
- Big `#842cff` "Live Demo" holder so you can safely switch to the app
- Optional 3-bullet demo-script reminder

### 12 — Tech Stack
- Compact tag grid: LangGraph · FastAPI · Claude Sonnet 4.5 (Computer Use) · Next.js 16 · Postgres · Docker

### 13 — Close / Thank You
- "QALoop — QA that runs itself."
- Team names, big confetti finale, Q&A prompt

---

## Demo script (for the ~20 min live block — Slide 11 hands off to this)
1. New project → new feature test (one-liner, e.g. *"Converting EUR to LKR"*)
2. Start run → **approve the Brief**
3. Show Agent 2 exploring live via **noVNC**
4. **Approve test cases** → bundle auto-generates → auto-executes
5. Land on **pass/fail results** with screenshots — confetti on green

---

## Open confirmations before HTML build
1. Is the phase → owner mapping correct (especially Risira = frontend)?
2. Slide count — 13 for ~15 min, or go leaner (~9)?
