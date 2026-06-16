import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./config";
import { logger } from "./logger";
import { extractRouter } from "./extractor/routes";
import { ExtractError } from "./extractor/errors";

const app = express();

// Trust proxy headers (ngrok, Render, reverse proxy)
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS - supports comma-separated origins or wildcard
const allowedOrigins =
  env.ALLOWED_ORIGINS === "*"
    ? "*"
    : env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  }),
);

// Body parser
app.use(express.json());

// Rate limiter for all extract endpoints
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: {
    meta: { status: 429, message: "Too many requests" },
    data: null,
    error: "Strict rate limit applied. Try again later.",
  },
});

// Routes
app.use("/api/v1/extract", limiter, extractRouter);

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, requestId: req.headers["x-request-id"] }, "Unhandled error");

  const statusCode = err instanceof ExtractError ? err.statusCode : 500;
  const message = statusCode === 500 ? "Internal Server Error" : err.message;

  res.status(statusCode).json({
    meta: { status: statusCode, message },
    data: null,
    error: message,
  });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
});
