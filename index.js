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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Получение случайной загадки по категории
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const r = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE TRIM(category) ILIKE $1 ORDER BY RANDOM() LIMIT 1', 
      [category.trim()]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No riddles" });
    res.json({ 
      id: r.rows[0].id, 
      question: r.rows[0].question, 
      len: r.rows[0].answer.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получение ответа для проверки на фронтенде
app.get('/api/reveal', async (req, res) => {
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

bot.start((ctx) => {
  ctx.reply(`Загадки Смайлика готовы! ✨`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)]
  ]));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
bot.launch({ dropPendingUpdates: true });
