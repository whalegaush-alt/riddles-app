const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

// 1. Сначала инициализируем Express
const app = express();

// 2. Настройка базы данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 3. Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- API ЭНДПОИНТЫ ---

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
    if (r.rows.length === 0) return res.status(404).json({ error: "Empty" });
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reveal', async (req, res) => {
  try {
    const result = await pool.query('SELECT answer, explanation FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    if (r.rows.length > 0 && r.rows[0].answer.toUpperCase() === answer.toUpperCase().trim()) {
      await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
      res.json({ success: true });
    } else res.json({ success: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- АДМИН-ФУНКЦИИ ---

app.get('/api/admin/riddles', async (req, res) => {
  const r = await pool.query('SELECT * FROM public.riddles ORDER BY id DESC');
  res.json(r.rows);
});

app.post('/api/riddles', async (req, res) => {
  const { question, answer, category, explanation } = req.body;
  await pool.query('INSERT INTO public.riddles (question, answer, category, explanation) VALUES ($1, $2, $3, $4)', [question, answer.toUpperCase().trim(), category, explanation]);
  res.json({ success: true });
});

app.put('/api/riddles/:id', async (req, res) => {
  const { question, answer, category, explanation } = req.body;
  await pool.query('UPDATE public.riddles SET question=$1, answer=$2, category=$3, explanation=$4 WHERE id=$5', [question, answer.toUpperCase().trim(), category, explanation, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/admin/riddles/:id', async (req, res) => {
  await pool.query('DELETE FROM public.riddles WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/use-hint', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
  res.json({ success: true });
});

// --- ЛОГИКА БОТА ---

bot.start((ctx) => {
  ctx.reply(`Загадки ждут тебя! ✨`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

// Запуск сервера
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));

// Запуск бота с обработкой ошибок
bot.launch({
    dropPendingUpdates: true // Это поможет избежать конфликтов при перезагрузке
}).then(() => console.log('🤖 Бот успешно запущен'))
  .catch(err => console.error('❌ Ошибка запуска бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
