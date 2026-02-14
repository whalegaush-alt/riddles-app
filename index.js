const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // Твой ID из переменных

// 1. Бот: показываем админку только тебе
bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  const buttons = [Markup.button.webApp('Открыть загадки 🧩', webAppUrl)];

  // Если зашел админ, добавляем вторую кнопку
  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('Админка (Добавить) ⚙️', `${webAppUrl}/admin.html` || ''));
  }

  ctx.reply('Привет! Готов к загадкам?', Markup.inlineKeyboard(buttons, { columns: 1 }));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// 2. API: Получение случайной загадки
app.get('/api/riddle', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public.riddles ORDER BY RANDOM() LIMIT 1');
    res.json(result.rows[0] || { error: 'Загадок нет' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. API: Добавление новой загадки (Админка)
app.post('/api/riddles', async (req, res) => {
  const { question, answer } = req.body;
  try {
    await pool.query('INSERT INTO public.riddles (question, answer) VALUES ($1, $2)', [question, answer]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен`));
bot.launch();
