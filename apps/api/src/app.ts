import express, { type Express } from "express";
import cors from "cors";
import { statementsRouter } from "./routes/statements";
import { transactionsRouter } from "./routes/transactions";
import { goalsRouter } from "./routes/goals";
import { insightsRouter } from "./routes/insights";
import { householdsRouter } from "./routes/households";
import { usersRouter } from "./routes/users";
import { incomeRouter } from "./routes/income";
import { perkCardsRouter } from "./routes/perkCards";
import { budgetsRouter } from "./routes/budgets";

export const app: Express = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/statements", statementsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/households", householdsRouter);
householdsRouter.use("/:hid/users", usersRouter);
householdsRouter.use("/:hid/budgets", budgetsRouter);
usersRouter.use("/:uid/income", incomeRouter);
usersRouter.use("/:uid/perk-cards", perkCardsRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));
