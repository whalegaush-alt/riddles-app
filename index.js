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

bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  const buttons = [Markup.button.webApp('ИГРАТЬ 🏰', webAppUrl)];
  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('АДМИНКА ⚙️', `${webAppUrl}/admin.html`));
  }
  ctx.reply(`Добро пожаловать в мир магии! Выбирай уровень и начни игру!`, Markup.inlineKeyboard(buttons));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Получение загадки с учетом категории
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const r = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1',
      [category || 'лёгкие']
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Загадок в этой категории пока нет' });
    }
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Все остальные API (user-info, check, reveal, use-hint, add-hints) оставляем из прошлого кода...
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(`INSERT INTO public.users (user_id, username, score, hints) VALUES ($1, $2, 0, 3) ON CONFLICT (user_id) DO UPDATE SET username = $2`, [user_id, username]);
    const data = await pool.query(`SELECT score, hints, (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank FROM public.users u1 WHERE user_id = $1`, [user_id]);
    res.json(data.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
  if (r.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
    await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
    res.json({ success: true });
  } else { res.json({ success: false }); }
});

app.get('/api/reveal', async (req, res) => {
  const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
  res.json(r.rows[0]);
});

app.post('/api/use-hint', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
  res.json({ success: true });
});

app.post('/api/add-hints', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
  res.json({ success: true });
});

// Обновленная админка с категорией
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  await pool.query('INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', [question, answer, category || 'лёгкие']);
  res.json({ success: true });
});

app.listen(process.env.PORT || 8080);
bot.launch();
