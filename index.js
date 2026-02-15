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
  const buttons = [Markup.button.webApp('ИГРАТЬ ✨', webAppUrl)];
  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('АДМИНКА ⚙️', `${webAppUrl}/admin.html`));
  }
  ctx.reply(`Добро пожаловать в Волшебную Викторину, ${ctx.from.first_name}!`, 
    Markup.inlineKeyboard(buttons, { columns: 1 }));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Получить данные пользователя и место
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(`
      INSERT INTO public.users (user_id, username, score, hints) 
      VALUES ($1, $2, 0, 3) ON CONFLICT (user_id) DO UPDATE SET username = $2
    `, [user_id, username]);
    const data = await pool.query(`
      SELECT score, hints, (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank
      FROM public.users u1 WHERE user_id = $1
    `, [user_id]);
    res.json(data.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/riddle', async (req, res) => {
  const result = await pool.query('SELECT id, question, answer FROM public.riddles ORDER BY RANDOM() LIMIT 1');
  res.json({ id: result.rows[0].id, question: result.rows[0].question, len: result.rows[0].answer.length });
});

app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
  if (result.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
    await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
    res.json({ success: true });
  } else { res.json({ success: false }); }
});

app.get('/api/reveal', async (req, res) => {
  const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
  res.json(result.rows[0]);
});

app.post('/api/use-hint', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
  res.json({ success: true });
});

app.post('/api/add-hints', async (req, res) => {
  await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
  res.json({ success: true });
});

app.post('/api/riddles', async (req, res) => {
  await pool.query('INSERT INTO public.riddles (question, answer) VALUES ($1, $2)', [req.body.question, req.body.answer]);
  res.json({ success: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Magic Server is ON'));
bot.launch();

