# 💰 Couple Finance Optimizer

A full-stack personal finance application designed to help couples understand
spending patterns, track shared expenses, and maximize savings for trips and
long-term goals.

---

## 🚀 Tech Stack

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
- Recharts

### Shared (`packages/shared`)
- Shared TypeScript types & domain models

---

## 🎯 Project Goals

- Upload and parse bank statements (CSV) from Alpha Bank, NBG, Winbank, Revolut
- Automatically categorize expenses via keyword matching + AI fallback
- Tag transactions as Personal (User 1 / User 2) or Shared (configurable split)
- Track monthly spending trends per category and per user
- Detect recurring payments and subscriptions
- Optimize and forecast savings goals (e.g. trips, emergencies)
- Surface actionable insights to reduce unnecessary spend

---

## 🏗 Project Structure
```
couple-finance/
├── apps/
│   ├── api/                        # Express backend
│   │   ├── src/
│   │   │   ├── parsers/            # Bank-specific CSV parsers
│   │   │   │   ├── base.ts         # BankParser interface + Transaction type
│   │   │   │   ├── alphaBank.ts
│   │   │   │   ├── nbg.ts
│   │   │   │   ├── winbank.ts
│   │   │   │   ├── revolut.ts
│   │   │   │   └── index.ts        # Auto-detection registry
│   │   │   ├── categorizer/
│   │   │   │   ├── index.ts        # Keyword → fuzzy → AI fallback pipeline
│   │   │   │   └── categories.json # Source of truth for all categories
│   │   │   ├── entities/           # TypeORM entities
│   │   │   │   ├── Transaction.ts
│   │   │   │   ├── User.ts
│   │   │   │   └── SavingsGoal.ts
│   │   │   ├── routes/
│   │   │   │   ├── statements.ts   # Upload + parse endpoints
│   │   │   │   ├── transactions.ts # CRUD + tagging endpoints
│   │   │   │   ├── goals.ts        # Savings goals
│   │   │   │   └── insights.ts     # Analytics + optimization
│   │   │   ├── services/
│   │   │   │   ├── parserService.ts
│   │   │   │   ├── categorizerService.ts
│   │   │   │   └── insightsService.ts
│   │   │   └── app.ts
│   │   └── package.json
│   │
│   └── web/                        # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── upload/         # Bank selector + file drop zone
│       │   │   ├── review/         # Transaction review queue table
│       │   │   ├── dashboard/      # Charts and summary cards
│       │   │   └── goals/          # Savings goal tracker
│       │   ├── pages/
│       │   │   ├── Upload.tsx
│       │   │   ├── Review.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   └── Goals.tsx
│       │   └── main.tsx
│       └── package.json
│
├── packages/
│   └── shared/                     # Shared across api + web
│       ├── src/
│       │   ├── types/
│       │   │   ├── transaction.ts  # Transaction, Owner, SplitRatio types
│       │   │   ├── category.ts     # Category + Subcategory types
│       │   │   └── goal.ts         # SavingsGoal type
│       │   └── index.ts
│       └── package.json
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 🏦 Supported Banks

| Bank | Format | Encoding | Notes |
|------|--------|----------|-------|
| Alpha Bank | CSV (`;` delimited) | Windows-1253 | Separate debit/credit columns |
| NBG | CSV (tab delimited) | UTF-8 | Separate debit/credit columns |
| Winbank (Piraeus) | CSV (`,` delimited) | UTF-8 | Single signed amount column |
| Revolut | CSV (`,` delimited) | UTF-8 | ISO dates, includes fees |

---

## 📂 Transaction Ownership

Each transaction can be tagged as:
- **Personal – User 1**
- **Personal – User 2**
- **Shared** — with a configurable split ratio (default 50/50)

---

## 🗂 Categories

Categories are defined in `apps/api/src/categorizer/categories.json` and can be
extended at any time. The categorizer pipeline runs:

1. Exact keyword match (normalized, accent-stripped)
2. Fuzzy match on description
3. AI fallback via Claude API
4. Manual fallback → `Uncategorized`

---

## 🚧 Roadmap

- [ ] PDF statement parsing
- [ ] Mobile-friendly UI
- [ ] Budget alerts (email / push)
- [ ] Multi-currency support (Revolut)
- [ ] Annual tax-year reports