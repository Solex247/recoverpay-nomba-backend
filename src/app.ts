// src/app.ts
import express from "express";
import cors from "cors";
import plansRouter from "./routes/plans";
import checkoutRouter from "./routes/checkout";
import subscriptionsRouter from "./routes/subscriptions";
import portalRouter from "./routes/portal";
import webhooksRouter from "./routes/webhooks";
import authRouter from "./routes/authRoutes";
import nombaConfigRouter from "./routes/nombaConfig";
import transactionsRouter from "./routes/transactions";
import { mountSwagger } from "./swagger";

export const app = express();

app.use(cors({
  origin: [
    "http://localhost:3001",
    process.env.FRONTEND_URL || "",
    "https://recover-pay.vercel.app",
  ].filter(Boolean),
  credentials: true,
}));

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", project: "RecoverPay", version: "1.0.0" });
});

// API routes
app.use("/v1/auth", authRouter);
app.use("/v1/nomba", nombaConfigRouter);
app.use("/v1/plans", plansRouter);
app.use("/v1/checkout", checkoutRouter);
app.use("/v1/subscriptions", subscriptionsRouter);
app.use("/v1/portal", portalRouter);
app.use("/v1/webhooks", webhooksRouter);
app.use("/v1/transactions", transactionsRouter);

// Swagger docs
mountSwagger(app);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});
