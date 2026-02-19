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

// Получение инфо о пользователе
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(
      `INSERT INTO public.users (user_id, username, score, hints) 
       VALUES ($1, $2, 0, 3) 
       ON CONFLICT (user_id) DO UPDATE SET username = $2`, [user_id, username]
    );
    const data = await pool.query(
      `SELECT hints, (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank 
       FROM public.users u1 WHERE user_id = $1`, [user_id]
    );
    res.json(data.rows[0] || { hints: 3, rank: '-' });
  } catch (err) {
    console.error("User Info Error:", err);
    res.json({ hints: 0, rank: 'ошибка' }); // Возвращаем заглушку вместо ошибки
  }
});

// Получение случайной загадки
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  console.log("Запрос категории:", category);
  try {
    const r = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1', 
      [category]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "Empty" });
    res.json({ id: r.rows[0].id, question: r.rows[0].question, len: r.rows[0].answer.length });
  } catch (err) {
    console.error("Riddle Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reveal', async (req, res) => {
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/add-hints-ad', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/use-hint', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

bot.start((ctx) => {
  ctx.reply(`Игра обновлена! ✨`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Сервер на порту ${PORT}`));
bot.launch({ dropPendingUpdates: true });
