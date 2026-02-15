const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// 1. Настройка базы данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. Настройка бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  const buttons = [
    [Markup.button.webApp('ИГРАТЬ 🏰', webAppUrl)]
  ];

  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push([Markup.button.url('АДМИНКА ⚙️', `${webAppUrl}/admin.html`)]);
  }

  ctx.reply(
    `Добро пожаловать в мир загадок! ✨\nВыбирай уровень и докажи, что ты самый умный!`,
    Markup.inlineKeyboard(buttons)
  );
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- API ДЛЯ ИГРОКОВ ---

// Получить данные пользователя (рейтинг и подсказки)
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    await pool.query(`
      INSERT INTO public.users (user_id, username, score, hints) 
      VALUES ($1, $2, 0, 3) 
      ON CONFLICT (user_id) DO UPDATE SET username = $2
    `, [user_id, username]);

    const data = await pool.query(`
      SELECT hints, 
      (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank
      FROM public.users u1 WHERE user_id = $1
    `, [user_id]);

    res.json(data.rows[0] || { hints: 3, rank: '-' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить случайную загадку по категории
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  try {
    const result = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1',
      [category || 'лёгкие']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Загадок в этой категории нет' });
    }
    res.json({ id: result.rows[0].id, question: result.rows[0].question, len: result.rows[0].answer.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Проверка ответа и начисление баллов
app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    if (result.rows.length > 0 && result.rows[0].answer.toUpperCase() === answer.toUpperCase().trim()) {
      await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Списание и добавление подсказок
app.post('/api/use-hint', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/add-hints', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Получить полный ответ (для системы подсказок)
app.get('/api/reveal', async (req, res) => {
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- API ДЛЯ АДМИНКИ ---

// Список всех загадок
app.get('/api/admin/riddles', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, question, answer, category FROM public.riddles ORDER BY id DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Создание загадки
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  try {
    await pool.query('INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', 
    [question, answer.toUpperCase().trim(), category]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Редактирование загадки
app.put('/api/riddles/:id', async (req, res) => {
  const { id } = req.params;
  const { question, answer, category } = req.body;
  try {
    await pool.query('UPDATE public.riddles SET question=$1, answer=$2, category=$3 WHERE id=$4', 
    [question, answer.toUpperCase().trim(), category, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Удаление загадки
app.delete('/api/admin/riddles/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM public.riddles WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Запуск
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

bot.launch().catch(err => console.error("Bot Error:", err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
