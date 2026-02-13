const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// 1. Настройка подключения к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Обязательно для работы с облаком Railway
  }
});

// 2. Настройка Telegram-бота
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  
  if (!webAppUrl) {
    return ctx.reply('⚠️ Внимание: Переменная URL не настроена в Railway!');
  }

  ctx.reply('Готов размять мозги? Нажимай кнопку ниже! 👇', Markup.inlineKeyboard([
    Markup.button.webApp('Открыть загадки 🧩', webAppUrl)
  ]));
});

// 3. Настройка веб-сервера (Express)
app.use(express.json());
// Раздаем статические файлы фронтенда из папки /frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// API эндпоинт для получения случайной загадки
app.get('/api/riddle', async (req, res) => {
  try {
    console.log('--- Запрос к БД: получение случайной загадки ---');
    
    // Используем явное указание схемы public.riddles
    const result = await pool.query(
      'SELECT id, question, answer FROM public.riddles ORDER BY RANDOM() LIMIT 1'
    );
    
    console.log(`Найдено загадок в базе: ${result.rows.length}`);

    if (result.rows.length === 0) {
      console.warn('⚠️ База данных ответила успешно, но таблица пуста.');
      return res.status(404).json({ error: 'Загадки не найдены в базе' });
    }
    
    // Отправляем первую попавшуюся строку
    res.json(result.rows[0]);
    
  } catch (err) {
    console.error('❌ ОШИБКА БАЗЫ ДАННЫХ:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера: ' + err.message });
  }
});

// Простая проверка работоспособности сервера
app.get('/health', (req, res) => {
  res.send('Сервер работает в штатном режиме!');
});

// Запуск сервера на порту, который выделит Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`--- Express сервер запущен на порту ${PORT} ---`);
});

// Запуск Telegram-бота
bot.launch()
  .then(() => console.log('--- Telegram-бот успешно запущен ---'))
  .catch((err) => console.error('❌ Ошибка запуска бота:', err));

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
