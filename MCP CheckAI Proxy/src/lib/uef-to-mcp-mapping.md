# UEF → MCP tool calls → where the data lives

This doc connects the **Universal Event Format** (see `universal-event-format.schema.json`)
to the **Soundcheck MCP tools** (see `mcp-tools.json`), so you can see exactly which
tool call writes each piece of UEF data and which platform record it becomes.

There are **three ways** UEF data reaches the platform. Pick whichever fits the demo:

| Path | When | Tool sequence |
| --- | --- | --- |
| **A. Direct create** | You already have structured data and want one record per call. Cleanest to *show* the 1:1 mapping. | `create_event` → `create_venue` / `link_venue_to_event` → `create_customer` → `add_event_member` → … |
| **B. Import wizard** | Bulk CSV/TSV (a spreadsheet of events, leads, inventory, members). | `create_import_from_paste` → `map_import` → `preview_import` → `commit_import` |
| **C. File ingestion** | Unstructured files (PDF contract, email, itinerary). The server extracts a UEF proposal you then commit. | `create_ingestion_batch` → `add_ingestion_text` → `trigger_ingestion_merge` → `get_ingestion_batch_review` → `commit_ingestion_batch` |

In paths B and C the **UEF document is what the server produces internally** — `preview_import`
and `get_ingestion_batch_review` both hand you back a UEF document (`proposals.events[0]…`),
and the commit step is what persists it. In path A you construct the equivalent records yourself.

---

## Field-by-field map

Each UEF entity maps to a platform record via a specific tool. `→` reads "becomes".

### `events[]` (UEFEvent) → **Event** record
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `title` / `event_type` / `event_date` / `start_time` / `end_time` / `notes` / `admin_notes` | `create_event` (`name`/`title`, `event_type`, `event_date`, `start_time`, `end_time`, `notes`) · `update_event` to change later | Event |
| `status` | `update_event.event_status` (ACTIVE/DRAFT/ARCHIVED) | Event.status |
| `location` / `location_name` / `place_id` / `latitude` / `longitude` | `create_event.location` / `location_name` | Event location fields |
| `external_id` | dedup key (import/ingestion crosswalk); not a direct create param | External*Identity table |

### `events[].venue` (UEFVenue) → **Venue** record (+ event link)
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `name` / `address` / `city` / `state` / `postal_code` / `country` | `create_venue` (`name`, `address` object) | Venue (org directory) |
| `phone_number` / `website` / `notes` / `latitude` / `longitude` | `create_venue` (same-named params) | Venue |
| (attach to the event) | `link_venue_to_event` (`event_id`, `venue_id`) — or, in ingestion, `commit_ingestion_batch.event_field_keys: ["venue"]` | Event↔Venue link |

### `events[].customer` (UEFCustomer + contacts) → **Customer** record
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `name` / `email` / `phone` / `website` / `notes` | `create_customer` (same-named params) | Customer |
| `contacts[]` | included on the customer record | Customer contacts |

### `events[].members[]` (UEFMember) → **EventMember** / **Invitation**
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `first_name` / `last_name` / `email` / `phone_number` / `position` / `performance_fee` / `call_order` | `add_event_member` (by `user_ids`) — or `commit_ingestion_batch.member_idx` (selects proposed members) | EventMember (+ Invitation) |

> Direct `add_event_member` takes existing `user_ids`. The ingestion/import paths resolve a
> member's name/email/position into the right user and write EventMember + Invitation for you.

### `events[].schedule_items[]` (UEFScheduleItem) → **ScheduleItem**
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `name` / `start_time` / `end_time` / `notes` / `order` | `commit_ingestion_batch.schedule_idx` (selects proposed schedule rows) | ScheduleItem (event timeline) |

### `events[].ledger_items[]` (UEFLedgerItem) → **LedgerItem**
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `type` (INCOME/EXPENSE/PAYABLE/RECEIVABLE) / `amount` / `currency` / `date` / `status` / `counterparty_*` / `account_hint` | `commit_ingestion_batch.ledger_idx` (selects proposed ledger rows); `account_hint` resolves to an Account | LedgerItem (event financials) |

### `leads[]` (UEFLead) → **LeadRequest**
| UEF field | MCP tool + param | Platform home |
| --- | --- | --- |
| `name` / `email` / `phone` / `event_date` / `event_type` / `location` / `budget` / `message` | `request_booking` (public) — or `commit_import` with `target_type: LEAD` | LeadRequest |
| `deal_stage` | qualifying stage gate decides which leads also become events | LeadRequest → Event |

### Other top-level collections
| UEF | Tool | Platform home |
| --- | --- | --- |
| `items[]` (UEFInventoryItem) | `commit_import` (`target_type: INVENTORY`) | InventoryItem |
| `org_members[]` (UEFOrgMember) | `commit_import` (`target_type: MEMBER`) | Org membership + invitation |
| `sponsors[]` (UEFSponsor) | `create_sponsor` | Sponsor |
| `setlists[]` (UEFSetlist) | `create_setlist` | Setlist |
| `calllists[]` (UEFCalllist) | `create_calllist` | Calllist |
| `accounts[]` (UEFAccount) | (chart of accounts; resolved via `account_hint` on ledger commits) | Account |

---

## Worked example — the demo event, two ways

Using `uef-example-event.json` (the Acme Corp Holiday Party).

### Path A — direct create (clearest 1:1 mapping for a demo)

```jsonc
// 1) the Event
create_event {
  "name": "Acme Corp Holiday Party",
  "title": "Acme Corp Holiday Party",
  "event_type": "Corporate",
  "event_date": "2026-12-12T18:00:00-08:00",
  "start_time": "2026-12-12T18:00:00-08:00",
  "end_time":   "2026-12-12T23:30:00-08:00",
  "location": "1100 Riverside Ave, San Francisco, CA 94110",
  "location_name": "The Riverside Grand Ballroom",
  "notes": "Load-in at 3pm via the north loading dock. Black-tie dress code."
}
// → returns event_id (e.g. "evt_123")

// 2) the Venue, then link it
create_venue {
  "name": "The Riverside Grand Ballroom",
  "address": { "line1": "1100 Riverside Ave", "city": "San Francisco", "state": "CA", "postal_code": "94110", "country": "USA" },
  "phone_number": "+1 415 555 0182",
  "website": "https://riversidegrand.example.com"
}
// → returns venue_id; then:
link_venue_to_event { "event_id": "evt_123", "venue_id": "ven_456" }

// 3) the Customer
create_customer {
  "name": "Acme Corporation",
  "email": "events@acme.example.com",
  "phone": "+1 415 555 0144",
  "website": "https://acme.example.com"
}

// 4) Members (each UEFMember → EventMember). user_ids resolved from list_users.
add_event_member { "event_id": "evt_123", "user_ids": ["usr_alex", "usr_sam", "usr_jordan"] }
```

> Note: in path A, `schedule_items` and `ledger_items` ride in through the ingestion/import
> commit (they don't have standalone direct-create tools), which is why path C is the most
> faithful end-to-end demo of the full UEF document.

### Path C — file ingestion (full document, including schedule + ledger)

```jsonc
// 1) batch on an existing event
create_ingestion_batch { "event_id": "evt_123" }            // → batch_id

// 2) feed the source text (e.g. the contract / promoter email)
add_ingestion_text { "event_id": "evt_123", "batch_id": "bat_789",
                     "text": "<pasted contract text…>", "source_name": "acme-contract" }

// 3) merge + review — the server returns a UEF proposal you can inspect
trigger_ingestion_merge { "event_id": "evt_123", "batch_id": "bat_789" }
get_ingestion_batch_review { "event_id": "evt_123", "batch_id": "bat_789" }
// → proposals.events[0] = a UEFEvent with:
//     members[0..2], schedule_items[0..3], ledger_items[0..2]   + merge_version

// 4) commit the rows you want. Indexes point into the proposal arrays above.
commit_ingestion_batch {
  "event_id": "evt_123",
  "batch_id": "bat_789",
  "merge_version": 1,
  "member_idx":   [0, 1, 2],     // → 3 EventMember rows
  "schedule_idx": [0, 1, 2, 3],  // → 4 ScheduleItem rows (load-in, sound check, two sets)
  "ledger_idx":   [0, 1, 2],     // → 3 LedgerItem rows (deposit PAID, balance UNPAID, expense)
  "event_field_keys": ["venue"]  // → creates/links the Riverside venue
  // first call returns confirmation_required + a token; resend the SAME args + confirmation_token
}
```

After step 4 the platform shows: the **Event** with a linked **Venue**, three **EventMember**
rows, a four-item **schedule/timeline**, and three **ledger** entries (one paid deposit, one
outstanding balance, one expense) — i.e. every populated branch of the UEF document now has a home.

---

## TL;DR for Lovable

- `universal-event-format.schema.json` — the input shape.
- `mcp-tools.json` — the tools (with input schemas) that consume it.
- This doc — which UEF field → which tool call → which platform record.
- For a live demo, **path C** ingests a whole UEF document end-to-end; **path A** is the clearest
  way to *show* the per-entity 1:1 mapping.
