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
  const buttons = [Markup.button.webApp('Играть 🧩', webAppUrl)];
  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('Админка ⚙️', `${webAppUrl}/admin.html`));
  }
  ctx.reply(`Привет, ${ctx.from.first_name}! Разгадай загадки и стань самым умным!`, 
    Markup.inlineKeyboard(buttons, { columns: 1 }));
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Получить случайную загадку
app.get('/api/riddle', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, question, LENGTH(answer) as len FROM public.riddles ORDER BY RANDOM() LIMIT 1');
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Проверка ответа и начисление баллов
app.post('/api/check', async (req, res) => {
  const { user_id, username, riddle_id, answer } = req.body;
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    if (!result.rows[0]) return res.status(404).send();

    if (result.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
      await pool.query(`
        INSERT INTO public.users (user_id, username, score) VALUES ($1, $2, 10)
        ON CONFLICT (user_id) DO UPDATE SET score = users.score + 10, username = $2
      `, [user_id, username]);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Рейтинг
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT username, score FROM public.users ORDER BY score DESC LIMIT 5');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Server run'));
bot.launch();
