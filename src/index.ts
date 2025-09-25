import { config } from 'dotenv';
import { startBot } from './bot';
import { LangChainService } from './services/langchainService';

// Загружаем переменные окружения
config();

// Проверяем наличие необходимых переменных окружения
if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be provided!');
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be provided!');
}

// Инициализируем сервисы
LangChainService.initialize();

// Запускаем бота
try {
  startBot();
} catch (error) {
  console.error('Error starting bot:', error);
}