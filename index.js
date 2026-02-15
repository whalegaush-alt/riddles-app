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

// БОТ
bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  ctx.reply(`Привет! Готов к загадкам? ✨`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', webAppUrl)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${webAppUrl}/admin.html`)]] : [])
  ]));
});

// API: Информация о пользователе
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(`INSERT INTO public.users (user_id, username, score, hints) VALUES ($1, $2, 0, 3) ON CONFLICT (user_id) DO UPDATE SET username = $2`, [user_id, username]);
    const data = await pool.query(`SELECT (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank, hints FROM public.users u1 WHERE user_id = $1`, [user_id]);
    res.json(data.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Получить загадку
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const r = await pool.query('SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1', [category || 'лёгкие']);
    if (r.rows.length === 0) return res.status(404).json({ error: "Empty" });
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Проверка
app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    if (r.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
      await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
      res.json({ success: true });
    } else res.json({ success: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// API: Узнать ответ (для системы)
app.get('/api/reveal', async (req, res) => {
  const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
  res.json(r.rows[0]);
});

// API: Подсказки
app.post('/api/use-hint', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
  res.json({ success: true });
});

app.post('/api/add-hints', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
  res.json({ success: true });
});

// API: Добавление из админки (ВАЖНО: Добавлена обработка ошибок)
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  try {
    await pool.query('INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', [question, answer.toUpperCase().trim(), category]);
    res.json({ success: true });
  } catch (err) {
    console.error("ADMIN ERROR:", err); // Это появится в логах Railway
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server run on ${PORT}`));

bot.launch().catch(err => console.error("Bot Error: ", err));
