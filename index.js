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
const ADMIN_ID = process.env.ADMIN_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- СИСТЕМА ПОЛЬЗОВАТЕЛЕЙ ---

// Запись пользователя при входе (UPSERT)
app.post('/api/user-init', async (req, res) => {
  const { id, username, first_name } = req.body;
  if (!id) return res.status(400).json({ error: "No ID" });

  try {
    await pool.query(
      `INSERT INTO public.users (id, username, first_name, last_seen) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (id) DO UPDATE 
       SET username = $2, first_name = $3, last_seen = NOW()`,
      [id, username || 'аноним', first_name || 'Игрок']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- API ДЛЯ ИГРЫ ---

app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const r = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE TRIM(category) ILIKE $1 ORDER BY RANDOM() LIMIT 1', 
      [category.trim()]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No riddles" });
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reveal', async (req, res) => {
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API ДЛЯ АДМИНКИ ---

app.get('/api/admin/riddles', async (req, res) => {
  const r = await pool.query('SELECT * FROM public.riddles ORDER BY id DESC');
  res.json(r.rows);
});

app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  await pool.query(
    'INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', 
    [question, answer.toUpperCase().trim(), category]
  );
  res.json({ success: true });
});

app.delete('/api/admin/riddles/:id', async (req, res) => {
  await pool.query('DELETE FROM public.riddles WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// --- БОТ ---

bot.start((ctx) => {
  ctx.reply(`Загадки Смайлика 🧩`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
bot.launch({ dropPendingUpdates: true });
