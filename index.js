const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// Настройка подключения к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Настройка Telegram-бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // Твой ID из переменных Railway

// Обработка команды /start
bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  const buttons = [
    Markup.button.webApp('Играть 🧩', webAppUrl)
  ];

  // Если зашел админ, добавляем кнопку админки
  if (ctx.from.id.toString() === ADMIN_ID) {
    buttons.push(Markup.button.url('Админка (Добавить) ⚙️', `${webAppUrl}/admin.html`));
  }

  ctx.reply(
    `Привет, ${ctx.from.first_name}! Разгадай все загадки и стань самым умным в рейтинге!`,
    Markup.inlineKeyboard(buttons, { columns: 1 })
  );
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- API ЭНДПОИНТЫ ---

// 1. Получить случайную загадку
app.get('/api/riddle', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, question, LENGTH(answer) as len FROM public.riddles ORDER BY RANDOM() LIMIT 1'
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка получения загадки:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Проверка ответа и начисление баллов
app.post('/api/check', async (req, res) => {
  const { user_id, username, riddle_id, answer } = req.body;
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    
    if (!result.rows[0]) return res.status(404).json({ error: 'Загадка не найдена' });

    // Сравниваем ответы в верхнем регистре
    if (result.rows[0].answer.toUpperCase() === answer.toUpperCase()) {
      // Добавляем 10 баллов пользователю
      await pool.query(`
        INSERT INTO public.users (user_id, username, score) 
        VALUES ($1, $2, 10)
        ON CONFLICT (user_id) 
        DO UPDATE SET score = users.score + 10, username = $2
      `, [user_id, username]);
      
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    console.error('Ошибка проверки ответа:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Получить правильный ответ (для кнопки "Узнать ответ")
app.get('/api/reveal', async (req, res) => {
  const { id } = req.query;
  try {
    const result = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [id]);
    if (result.rows[0]) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'Не найдено' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Получить топ-5 игроков
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, score FROM public.users ORDER BY score DESC LIMIT 5'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Добавление новой загадки через админку
app.post('/api/riddles', async (req, res) => {
  const { question, answer } = req.body;
  try {
    await pool.query(
      'INSERT INTO public.riddles (question, answer) VALUES ($1, $2)',
      [question, answer]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`--- Express сервер запущен на порту ${PORT} ---`);
});

// Запуск бота
bot.launch()
  .then(() => console.log('--- Telegram-бот запущен ---'))
  .catch((err) => console.error('Ошибка бота:', err));

// Мягкая остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
