import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { generateCommand, handleDocument, } from './commands/generate';
import { message } from 'telegraf/filters';
import { Context, NarrowedContext } from 'telegraf';

config();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be provided!');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Регистрация команд
bot.command('invoice', generateCommand);
bot.on(message('document'), handleDocument);

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.');
});

export const startBot = async () => {
  console.log('Starting bot...');
  await bot.launch()
    .then(() => {
      console.log('Bot started successfully');
    })
    .catch((err) => {
      console.error('Error starting bot:', err);
    });

  // Включаем graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};