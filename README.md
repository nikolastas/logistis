# Couple Finance Optimizer

A full-stack personal finance application for households to track spending, manage shared expenses, detect transfers, and optimize savings for trips and long-term goals.

---

## Tech Stack

### Monorepo
- pnpm workspaces

### Backend (`apps/api`)
- Node.js + TypeScript
- Express
- PostgreSQL
- TypeORM

### Frontend (`apps/web`)
- React (Vite) + TypeScript
- TailwindCSS
- Chart.js (react-chartjs-2)

### Shared (`packages/shared`)
- Shared TypeScript types and domain models

---

## Project Goals

- **Household management** — Create households with multiple users; each user has an `expenseShare` (0–1) for splitting shared transactions
- **Bank statement upload** — Parse CSV, XLSX, and PDF from Alpha Bank, NBG, Winbank, Revolut, Payzy
- **Transfer detection** — Classify transfers as own-account (excluded from analytics), household-member, or third-party; match counterparties via `User.nameAliases`
- **Transaction ownership** — Tag as personal (`userId` set) or shared (`userId` null, split by `User.expenseShare`)
- **Categorization** — Keyword matching + fuzzy + optional AI fallback; transfer type encoded in `categoryId` (e.g. `transfer/own-account`, `transfer/to-household-member`)
- **Income & perk cards** — Track net salary per user; PerkCard entity (meal vouchers, etc.) with `monthlyValue` and linked categories
- **Savings goals** — Set targets and track progress
- **Insights** — Dashboard with Month/Year/Scope filters; spending by category (pie); yearly trends by category (line); monthly trends (bar); transfer analytics; exclude own-account transfers from totals

---

## Project Structure

```
couple-finance/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── parsers/           # Bank-specific parsers
│   │   │   │   ├── base.ts        # BankParser interface
│   │   │   │   ├── alphaBank.ts
│   │   │   │   ├── nbg.ts
│   │   │   │   ├── nbgXlsx.ts     # NBG XLSX (Greek columns)
│   │   │   │   ├── winbank.ts
│   │   │   │   ├── revolut.ts     # Revolut CSV (pocket, Apple Pay deposit, transfer hints)
│   │   │   │   ├── payzy.ts       # Payzy e-proof PDF
│   │   │   │   ├── genericPdf.ts
│   │   │   │   └── index.ts
│   │   │   ├── categorizer/
│   │   │   │   ├── index.ts       # Keyword → fuzzy → AI pipeline
│   │   │   │   └── categories.json
│   │   │   ├── entities/
│   │   │   │   ├── Transaction.ts
│   │   │   │   ├── User.ts
│   │   │   │   ├── Household.ts
│   │   │   │   ├── Category.ts
│   │   │   │   ├── Income.ts
│   │   │   │   ├── IncomePerkCard.ts
│   │   │   │   ├── PerkCard.ts
│   │   │   │   └── SavingsGoal.ts
│   │   │   ├── routes/
│   │   │   │   ├── statements.ts  # Upload + parse
│   │   │   │   ├── transactions.ts
│   │   │   │   ├── households.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── income.ts
│   │   │   │   ├── perkCards.ts
│   │   │   │   ├── goals.ts
│   │   │   │   └── insights.ts
│   │   │   ├── services/
│   │   │   │   ├── parserService.ts
│   │   │   │   ├── transferDetectionService.ts
│   │   │   │   └── insightsService.ts
│   │   │   └── db/
│   │   │       └── migrations/
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   │   ├── Upload.tsx
│       │   │   ├── Review.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Goals.tsx
│       │   │   └── Settings.tsx
│       │   └── main.tsx
│       └── package.json
│
├── packages/
│   └── shared/
│       └── src/types/
│           ├── transaction.ts
│           ├── user.ts
│           ├── income.ts
│           └── goal.ts
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker (for PostgreSQL)

### Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start PostgreSQL**
   ```bash
   docker compose up -d
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` if needed. Add `OPENAI_API_KEY` for AI categorization.

4. **Run migrations**
   ```bash
   pnpm db:migrate
   ```

5. **Seed categories**
   ```bash
   pnpm db:seed
   ```

6. **Run development servers**
   ```bash
   pnpm dev
   ```
   - API: http://localhost:3001
   - Web: http://localhost:5173

### Build

```bash
pnpm build
```

---

## Supported Banks

| Bank | Format | Notes |
|------|--------|-------|
| Alpha Bank | CSV (`;` delimited) | Windows-1253 |
| NBG | CSV (tab) or XLSX | XLSX has Greek column headers; counterparty from "Λογαριασμός αντισυμβαλλόμενου" |
| Winbank (Piraeus) | CSV (`,` delimited) | UTF-8 |
| Revolut | CSV (`,` delimited) | Type, Product, Started/Completed Date; pocket transfers, Apple Pay deposit, person-to-person transfers |
| Payzy | PDF (e-proof) | Select "Payzy (e-proof PDF)" on upload; "PAYZY BY COSMOTE" = own-account top-up |
| Generic | PDF | Basic text extraction |

---

## Transaction Model

| Field | Description |
|-------|-------------|
| `userId` | Owner (null = shared, split by `User.expenseShare`) |
| `categoryId` | Includes transfer type: `transfer/own-account`, `transfer/to-household-member`, etc. |
| `transferCounterpartyUserId` | FK to User when transfer is to/from a household or external user |
| `linkedTransactionId` | Matching leg for own-account transfers (e.g. Alpha Bank ↔ Revolut) |
| `isExcludedFromAnalytics` | true for own-account transfers |
| `countAsExpense` | For third-party transfers: include in analytics if user marks as expense |

Shared transactions use `User.expenseShare` (per user) to allocate amounts. No `splitRatio` on transactions.

---

## Transfer Detection

- **Own-account** — Moving money between same user's accounts (e.g. Alpha → Revolut). Includes: pocket transfers ("to pocket", "αποταμίευση"); Apple Pay deposit by *XXXX; "PAYZY BY COSMOTE" (Payzy top-up from bank/card, detected from any bank). Excluded from analytics; legs linked via `linkedTransactionId`.
- **Household member** — To/from another user in the same household. `transferCounterpartyUserId` set; matched via `User.nameAliases`.
- **Third-party** — To/from someone outside the household. Can be marked `countAsExpense` if it represents a real expense.

---

## Categories

Defined in `apps/api/src/categorizer/categories.json`. Transfer categories:

- `transfer/own-account`
- `transfer/to-household-member`, `transfer/from-household-member`
- `transfer/to-external-member`, `transfer/from-external-member`
- `transfer/to-third-party`, `transfer/from-third-party`

Pipeline: keyword match → fuzzy match → AI fallback (optional) → Uncategorized.

---

## Roadmap

- [x] PDF statement parsing
- [x] Transfer detection and linking
- [x] PerkCard entity (meal vouchers, etc.)
- [x] User expenseShare (per-user split)
- [x] Payzy e-proof PDF parser
- [x] Revolut Apple Pay deposit as own-account
- [x] Dashboard filtering (month, year, scope: household/shared/user)
- [x] Chart.js charts (pie, line, bar)
- [ ] Mobile-friendly UI
- [ ] Budget alerts
- [ ] Multi-currency support
- [ ] Annual tax-year reports
