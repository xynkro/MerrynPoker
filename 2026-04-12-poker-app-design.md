# Merryn Poker — Design Spec

**Date:** 2026-04-12
**Status:** Approved (brainstorming complete)

---

## 1. Problem

Sarah deals poker at Derrick's place. She tracks buy-ins, rebuys, cash-outs, settlement, carry-forward balances, and a dual-currency float (SGD cash + USDT via BTSE) using three Excel workbooks. The workflow is slow, error-prone, and manual. Settlement math (who pays whom, in what currency, netted against prior carries) is done in her head.

## 2. Solution

A single-file Progressive Web App (PWA) that runs offline on Sarah's iPhone during the game and syncs to a Google Sheet backend when online. Phone is the primary device. Caspar's laptop is an optional widescreen viewer.

## 3. Constraints

- Zero cost (no paid hosting, no Apple Developer account)
- Offline-first (works at Derrick's with no internet)
- Phone-first UI (one-thumb, big tap targets)
- Google Sheets + Apps Script as sync backend
- Single-file HTML deliverable (AirDrop to Sarah's phone)
- PIN lock: 797997

## 4. Architecture

```
┌─────────────────────────────────┐
│  PWA (single HTML file)         │
│  ├── UI: HTML + CSS + JS        │
│  ├── Local state: IndexedDB     │
│  └── Sync queue → Apps Script   │
└──────────┬──────────────────────┘
           │ HTTPS (when online)
┌──────────▼──────────────────────┐
│  Google Apps Script Web App     │
│  ├── doPost() — write rows      │
│  ├── doGet()  — read data       │
│  └── Auth: deployment URL only  │
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│  Google Sheet (database)        │
│  ├── Tab: Players               │
│  ├── Tab: Sessions              │
│  ├── Tab: SessionEntries        │
│  ├── Tab: FloatTransactions     │
│  └── Tab: CarryBalances         │
└─────────────────────────────────┘
```

Sync model: local-first. All writes go to IndexedDB immediately. Background sync pushes to Apps Script when network available. Last-write-wins with `updated_at` timestamps.

## 5. Data Model

### Player
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| name | string | "Derrick", "Seb", etc. |
| role | enum | `player` / `bank` / `dealer` |
| preferred_payout | enum | `cash_sgd` / `usdt` / `either` |
| notes | string | free text |
| updated_at | timestamp | for sync |
| deleted_at | timestamp? | soft delete |

Pre-loaded roster: Derrick (bank), Sarah (dealer), Seb, KQ, Edwin, James, Kong, Darren, Sam, CJ, Wayne, XO, Gary, Neda, Nicole, Eric.

### Session
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| date | date | e.g. 2026-04-10 |
| status | enum | `active` / `settled` / `reconciled` |
| notes | string | |
| updated_at | timestamp | |
| deleted_at | timestamp? | |

No `dealer_tips` field — Sarah is a SessionEntry.

### SessionEntry
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| session_id | UUID | |
| player_id | UUID | |
| buy_ins | array of {amount, timestamp} | unlimited rebuys |
| cash_out | number | final chip stack value in SGD |
| net_pl | computed | cash_out - sum(buy_ins). Never manually entered. |
| settlement_method | enum? | `cash` / `usdt` / `roll_forward` / null (set at settlement) |
| updated_at | timestamp | |
| deleted_at | timestamp? | |

Sarah's entry: buy_ins=[], cash_out=tips, net_pl=+tips.

### FloatTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| session_id | UUID? | nullable for off-session conversions |
| timestamp | timestamp | |
| type | enum | `SETTLEMENT_CASH_IN`, `SETTLEMENT_CASH_OUT`, `USDT_TRANSFER`, `CONVERT_CASH_TO_USDT`, `CONVERT_USDT_TO_CASH`, `BANK_ABSORB`, `DEALER_TIPS`, `ADJUSTMENT` |
| amount_sgd | number | signed |
| amount_usdt | number | signed |
| rate_used | number? | USDT/SGD rate at time of actual transfer |
| player_id | UUID? | |
| note | string | |
| updated_at | timestamp | |
| deleted_at | timestamp? | |

Float balance = sum(amount_sgd), sum(amount_usdt) across all transactions.

### CarryBalance
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | |
| player_id | UUID | |
| amount_sgd | number | signed. +ve = float owes player. -ve = player owes float. |
| origin_session_id | UUID? | null for pre-app legacy carries |
| status | enum | `open` / `cleared` |
| cleared_at | timestamp? | |
| cleared_via | string? | "USDT transfer", "cash", "netted in session X" |
| rate_used | number? | if cleared via USDT |
| usdt_amount | number? | actual USDT sent |
| note | string | |
| updated_at | timestamp | |
| deleted_at | timestamp? | |

## 6. Screens

### 6.1 PIN Lock
6-digit PIN entry (797997). Three wrong attempts → 5min lockout.

### 6.2 Dashboard
- Float status card: "SGD $X · USDT Y"
- Open carry-balances strip (horizontal scroll, age-sorted, red > 30 days)
- Recent sessions list
- "Start New Session" CTA (full-width bottom)

### 6.3 Active Session
- Top bar: date, running dealer tips, total chips on table
- Player card grid: name, total buy-in, "still in" / cashed out status
- Tap card → quick-action sheet:
  - +5k / +10k / +20k / +50k quick rebuy
  - Custom amount
  - Cash out (numeric input)
- Floating "Add Player" button → roster picker
- "End Session" button → settlement

### 6.4 Settlement
- Zero-sum verification (auto, red banner if broken)
- Net position table: player, session P/L, open carry, net position
- Derrick row shaded (auto-absorbed into float)
- Sarah row shaded (tips, always cash)
- Per-player toggle: Cash tonight / USDT (transfer later) / Roll forward
- Float feasibility banner (green/red)
- Manual override mode for direct payer↔receiver pairing
- Commit button

### 6.5 USDT Clearance (inside Carry Balances)
- Tap a "USDT pending" carry → "Mark Cleared"
- Enter: USDT amount, rate, date
- Creates FloatTransaction(USDT_TRANSFER)

### 6.6 Float Ledger
- Running balance lines (cash + USDT)
- Filterable transaction list
- Export CSV

### 6.7 Carry Balances
- Tabs: Open / Cleared
- Age-sorted (oldest first, red > 30 days)
- Swipe to clear manually

### 6.8 Players (Roster)
- Add / edit / delete
- Set role, preferred payout

### 6.9 Settings
- Export JSON backup
- Import JSON
- Google Sheet sync status
- Manual sync trigger
- Clear all data (double confirm)

## 7. Settlement Algorithm

### Inputs
- session_entries[] (all players including Sarah)
- open_carries[] (all CarryBalance where status=open)
- float.cash_sgd, float.usdt

### Steps

**Step 0 — Zero-sum check**
sum(entry.net_pl for all entries) must equal 0.

**Step 1 — Compute net positions**
For each player: net_position = session_pl + sum(open_carries).
Derrick (bank): net_position adjusts float.cash directly. No transaction.
Sarah (dealer): net_position = +tips. Paid cash like any winner.

**Step 2 — Classify**
Payers: net_position < 0.
Receivers: net_position > 0.
Zeroed: net_position == 0.

**Step 3 — Sarah picks payout method per receiver**
- Cash tonight → immediate float debit
- USDT (transfer later) → pending CarryBalance
- Roll forward → CarryBalance, no float movement

**Step 4 — Cash feasibility**
projected_cash = float.cash + sum(payer amounts) - sum(cash-tonight amounts).
If < 0: block, offer options (roll someone, pair directly, convert USDT).

**Step 5 — Generate proposals**
List of settlement rows. All editable before commit.

**Step 6 — Commit**
Close old carries for tonight's players. Create new carries for USDT-pending / rolls. Create FloatTransactions for cash movements. Session → settled.

**Step 7 — USDT clearance (later)**
Separate flow in Carry Balances screen. Records actual rate + USDT amount at time of real BTSE transfer.

## 8. Tech Stack

- **Frontend:** Single HTML file. Vanilla JS (no framework — keeps file size small, no build step). CSS with responsive breakpoints.
- **Local storage:** IndexedDB via idb-keyval or raw IDB API.
- **Service worker:** For PWA install (Add to Home Screen). Caches the single HTML file.
- **Backend:** Google Apps Script Web App (doGet/doPost).
- **Database:** Google Sheet (5 tabs matching entities).
- **Distribution:** AirDrop HTML file. Optional: `python3 -m http.server` on laptop for PWA install.

## 9. Data Migration

Import from existing Excel files:
- **Player roster:** extract unique names from all session sheets.
- **Carry balances:** from Balsheet_1004 (latest): Nicole -32,300, Wayne -3,400, XO +2,300, Gary +900, Seb +25,000.
- **Float state:** Cash SGD 70,000 + 80,400 = 150,400 (per Balsheet_1004 comments). BTSE USDT 28,000.
- **Historical sessions:** optional second phase. Import all archived session sheets as historical data.

## 10. Testing Plan

1. Caspar tests on laptop (open HTML file in browser)
2. Caspar tests on iPhone (serve locally, Add to Home Screen)
3. Mock session: add players, buy-ins, rebuys, cash-outs, settlement
4. Verify zero-sum, carry netting, float computation
5. Test offline mode (airplane mode at step 3)
6. Test sync (reconnect, verify Google Sheet populated)
7. AirDrop to Sarah for real-game trial

## 11. Future / Out of Scope

- Multi-user real-time editing (same session, two phones)
- Push notifications
- Tournament mode (blinds, levels)
- Dark mode toggle (auto-follows iOS system)
- Multi-currency beyond SGD/USDT
- Photo capture per player
- App Store distribution
