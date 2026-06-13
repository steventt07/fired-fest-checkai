# Agent Harness

A **harness** is the framework an AI agent lives inside. This one governs a
file → UEF extraction agent. The agent is the replaceable worker; everything
that constrains, evaluates, feeds, and watches it is the harness.

Open the **Harness Console** at `/harness` to run it.

---

## The four pillars

| Pillar | What it provides | Code |
| --- | --- | --- |
| **Guardrails** | Declared constraints that limit agent behavior, evaluated pre- and post-run | `src/lib/harness/guardrails.ts` |
| **Checkpoints** | Ordered evaluations of output with explicit pass/fail criteria, persisted for replay | `src/lib/harness/checkpoints.ts` |
| **Material** | Clean interfaces for passing work in (`intake`) and out (`emit`) | `src/lib/harness/material.ts` |
| **Alarms** | Named, severity-tagged alerts with recommended actions that drive escalation | `src/lib/harness/alarms.ts` |

The orchestrator (`src/lib/harness/orchestrator.server.ts`) wires the pillars
around the worker:

```text
intake → pre-guardrails → agent.run → post-guardrails + checkpoints
       → (on failure) build feedback → re-run agent
       → alarms → human-in-the-loop gate → emit
```

The harness owns no domain logic. It coordinates pillars and the agent only.

---

## Swappable agent interface

The worker is any implementation of `AgentAdapter` (`src/lib/harness/types.ts`):

```ts
type AgentAdapter = {
  id: string;
  label: string;
  model: string;
  run: (input: AgentRunInput) => Promise<AgentRunOutput>;
};
```

Two adapters ship today, both behind the same interface:

- `gemini-flash` — Lovable AI · Gemini 3 Flash
- `gpt-5-mini` — Lovable AI · GPT-5 mini

Dropping in a different worker requires **zero harness changes** — add an
adapter to `src/lib/harness/agents/index.server.ts` and it appears in the
console selector. Pick a worker, run, then switch workers and re-run to prove
portability live.

The harness depends on the `AgentAdapter` *interface*, never on a concrete
worker. Guardrails, checkpoints, alarms, and material handling import none of
the agent code.

---

## Persisted checkpoints & replay

Every run and its checkpoint results are persisted to Lovable Cloud
(`harness_runs`, `harness_checkpoints`), including a snapshot of the material
each checkpoint evaluated. From the console, **replay** re-evaluates checkpoints
from any ordinal forward against the stored snapshot — the agent and all prior
stages are skipped (`replayFromCheckpoint` in
`src/lib/harness/harness.functions.ts`).

---

## Human-in-the-loop escalation

The harness stops and asks rather than guessing when:

- a critical pre-flight guardrail fails (the agent never runs),
- the agent errors,
- any critical alarm fires (failed checkpoint, schema drift), or
- confidence falls below threshold.

`shouldEscalate` (`src/lib/harness/alarms.ts`) decides; the run is marked
`escalated`/`blocked` and the console surfaces an Approve / Reject gate
(`resolveEscalation`).

---

## Failure-driven retries

When a checkpoint fails, `feedbackFromCheckpoints` builds a correction prompt
and the orchestrator re-runs the agent with it (one retry). The agent must
change behavior in response — failed runs are not silently committed.

---

## Architecture notes

- Pure pillar modules (guardrails/checkpoints/alarms/material) import no agent
  code, keeping harness/worker separation demonstrable.
- All agent calls, model keys, and persistence live in server-only modules
  (`*.server.ts`) reached through `createServerFn` handlers; the admin client is
  imported inside handlers so it never leaks to the client bundle.
- The console (`src/routes/harness.tsx`) is presentation only.
