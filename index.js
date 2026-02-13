const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// 1. Настройка базы данных
// ssl: { rejectUnauthorized: false } — критично для работы с Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 2. Настройка бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  
  if (!webAppUrl) {
    return ctx.reply('Внимание: Переменная URL не настроена в Railway!');
  }

  ctx.reply('Готов размять мозги? Нажимай кнопку ниже!', Markup.inlineKeyboard([
    Markup.button.webApp('Открыть загадки 🧩', webAppUrl)
  ]));
});

// 3. Настройка веб-сервера (Express)
app.use(express.json());
// Указываем серверу, что файлы фронтенда лежат в папке /frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// API эндпоинт: отдает одну случайную активную загадку
app.get('/api/riddle', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, question, answer FROM riddles WHERE is_active = true ORDER BY RANDOM() LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Загадки не найдены в базе' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка БД:', err);
    res.status(500).json({ error: 'Ошибка сервера при обращении к БД' });
  }
});

// Проверка работоспособности (просто открыть в браузере ссылку от Railway)
app.get('/health', (req, res) => {
  res.send('Сервер работает корректно!');
});

// Запуск всего вместе
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`--- СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT} ---`);
});

// Запуск бота с обработкой ошибок
bot.launch()
  .then(() => console.log('--- ТЕЛЕГРАМ БОТ ЗАПУЩЕН ---'))
  .catch((err) => console.error('Ошибка запуска бота:', err));

// Мягкая остановка при выключении сервера
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
