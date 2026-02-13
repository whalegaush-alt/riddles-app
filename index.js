const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// Инициализация пула соединений
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// Обработка команды /start
bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  ctx.reply('Готов размять мозги?', Markup.inlineKeyboard([
    Markup.button.webApp('Открыть загадки 🧩', webAppUrl)
  ]));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// API эндпоинт
app.get('/api/riddle', async (req, res) => {
  try {
    console.log('--- Запрос к базе данных ---');
    // Используем простой запрос без лишних фильтров для проверки
    const result = await pool.query('SELECT * FROM public.riddles ORDER BY RANDOM() LIMIT 1');
    
    if (result.rows.length === 0) {
      console.log('Таблица пуста');
      return res.status(404).json({ error: 'Загадок нет' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('ОШИБКА ПОДКЛЮЧЕНИЯ К БД:', err.message);
    res.status(500).json({ error: 'Ошибка базы: ' + err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Сервер на порту ${PORT}`);
});

bot.launch().catch(err => console.error('Ошибка бота:', err));

