import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { extractRouter } from './extractor';

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares (User Rules 44, 49)
app.use(helmet()); // Sets security headers (HSTS, CSP, X-Frame-Options)
app.use(cors({
  origin: '*', // For MVP, should be narrowed in prod per rule 49
  methods: ['GET', 'POST']
}));

// Rate Limit (User Rules 19, 42)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per `window` (here, per 1 minute)
  message: {
    meta: { status: 429, message: 'Too many requests' },
    data: null,
    error: 'Strict rate limit applied. Try again later.'
  }
});

// Middleware
app.use(express.json());

// Routes (User Rule 16: Version Required)
app.use('/api/v1/extract', limiter, extractRouter);

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack); // Log for internal
  res.status(500).json({
    meta: { status: 500, message: 'Internal Server Error' },
    data: null,
    error: 'Something went wrong processing your request.'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
