import dotenv from 'dotenv';
import app from './app.js';
import { logInfo } from './utils/logger.js';
import { initializeRAG } from './services/ragService.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  logInfo(`Server is running on port ${PORT}`);
  logInfo('Initializing RAG Vector Store...');
  await initializeRAG();
});
