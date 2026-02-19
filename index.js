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

// API для игры и админки
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(`INSERT INTO public.users (user_id, username, score, hints) VALUES ($1, $2, 0, 3) ON CONFLICT (user_id) DO UPDATE SET username = $2`, [user_id, username]);
    const data = await pool.query(`SELECT hints, (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank FROM public.users u1 WHERE user_id = $1`, [user_id]);
    res.json(data.rows[0] || { hints: 3, rank: '-' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const r = await pool.query('SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1', [category]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Пусто" });
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reveal', async (req, res) => {
  const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
  res.json(r.rows[0]);
});

app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  await pool.query('INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', [question, answer.toUpperCase().trim(), category]);
  res.json({ success: true });
});

app.get('/api/admin/riddles', async (req, res) => {
  const r = await pool.query('SELECT * FROM public.riddles ORDER BY id DESC');
  res.json(r.rows);
});

bot.start((ctx) => {
  ctx.reply(`Игра готова!`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));

// ВАЖНО: dropPendingUpdates очищает очередь и убирает ошибку 409
bot.launch({ dropPendingUpdates: true });
