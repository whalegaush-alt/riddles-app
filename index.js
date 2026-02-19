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
const ADMIN_ID = process.env.ADMIN_ID; // ID админа из переменных Railway

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- МЕТОДЫ ДЛЯ ИГРЫ ---

// Получение случайной загадки
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

// Получение ответа (для проверки)
app.get('/api/reveal', async (req, res) => {
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- МЕТОДЫ ДЛЯ АДМИНКИ ---

// Список всех загадок
app.get('/api/admin/riddles', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM public.riddles ORDER BY id DESC');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавление новой загадки
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  try {
    await pool.query(
      'INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', 
      [question, answer.toUpperCase().trim(), category]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удаление загадки
app.delete('/api/admin/riddles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM public.riddles WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ЛОГИКА БОТА ---

bot.start((ctx) => {
  ctx.reply(`Загадки Смайлика 🧩`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

// Запуск сервера
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});

// Запуск бота с очисткой старых обновлений
bot.launch({ dropPendingUpdates: true });
