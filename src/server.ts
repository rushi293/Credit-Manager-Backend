import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRoutes from './routes/index';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

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
