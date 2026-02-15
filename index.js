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
    Markup.button.webApp('ИГРАТЬ ✨', webAppUrl)
  ];

  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('АДМИНКА ⚙️', `${webAppUrl}/admin.html`));
  }

  ctx.reply(
    `Добро пожаловать в Волшебную Викторину, ${ctx.from.first_name}!\nВыбирай категорию и начни свое приключение! 🏰`,
    Markup.inlineKeyboard(buttons, { columns: 1 })
  );
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- API ЭНДПОИНТЫ ---

// Получить данные пользователя (баллы, подсказки и место в рейтинге)
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    // Регистрируем или обновляем имя
    await pool.query(`
      INSERT INTO public.users (user_id, username, score, hints) 
      VALUES ($1, $2, 0, 3) 
      ON CONFLICT (user_id) DO UPDATE SET username = $2
    `, [user_id, username]);

    // Считаем место (rank) через оконную функцию или подзапрос
    const data = await pool.query(`
      SELECT score, hints, 
      (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank
      FROM public.users u1 WHERE user_id = $1
    `, [user_id]);

    res.json(data.rows[0] || { score: 0, hints: 3, rank: '-' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить случайную загадку по категории
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query; // Получаем категорию из запроса
  try {
    const result = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE category = $1 ORDER BY RANDOM() LIMIT 1',
      [category || 'лёгкие']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Загадок в этой категории нет' });
    }

    const riddle = result.rows[0];
    // Отправляем ID, вопрос и длину ответа (сам ответ скрываем)
    res.json({ 
      id: riddle.id, 
      question: riddle.question, 
      len: riddle.answer.length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Проверка ответа
app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    
    if (result.rows.length > 0 && result.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
      // Начисляем 10 баллов за верный ответ
      await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Узнать ответ (для подсказок или кнопки "Узнать")
app.get('/api/reveal', async (req, res) => {
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(result.rows[0] || { answer: "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Списать подсказку
app.post('/api/use-hint', async (req, res) => {
  const { user_id } = req.body;
  try {
    await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить подсказки (за рекламу)
app.post('/api/add-hints', async (req, res) => {
  const { user_id } = req.body;
  try {
    await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Админка: Добавление загадки с категорией
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  try {
    await pool.query(
      'INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)',
      [question, answer, category || 'лёгкие']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Запуск серверов
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`--- Magic Server running on port ${PORT} ---`));

bot.launch()
  .then(() => console.log('--- Disney Bot Launched ---'))
  .catch((err) => console.error('Bot Error:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
