import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRoutes from './routes/index';

dotenv.config();

const app = express();

app.use(express.json());

// Configure CORS to cache preflight requests for 2 hours (7200s).
// This eliminates the repeated 271-755ms OPTIONS round-trips seen in the browser Network panel.
// Each unique method+header combination is cached per-origin; subsequent API requests skip preflight.
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In production the deployed frontend origin must be in CORS_ALLOWED_ORIGINS
    return callback(null, true); // permissive fallback — tighten by removing this line in production
  },
  credentials: true,
  maxAge: 7200, // Browser caches the preflight response for 2 hours
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));

// Handle OPTIONS preflight early — before heavy middleware runs
app.options('*', cors({
  origin: true,
  credentials: true,
  maxAge: 7200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));

app.use(helmet());
app.use(morgan('dev'));

// Disable caching for all API responses to ensure real-time updates work correctly
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Root test API
app.get('/', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Credit Manager Backend is running perfectly on Vercel!',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
