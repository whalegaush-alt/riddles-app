const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// Подключение к базе данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// --- API ДЛЯ ИГРЫ ---

// 1. Получение инфо о пользователе (Рейтинг и Подсказки)
app.post('/api/user-info', async (req, res) => {
  const { user_id, username } = req.body;
  try {
    // Проверка/Создание пользователя
    await pool.query(
      `INSERT INTO public.users (user_id, username, score, hints) 
       VALUES ($1, $2, 0, 3) 
       ON CONFLICT (user_id) DO UPDATE SET username = $2`, 
      [user_id, username]
    );
    
    const data = await pool.query(
      `SELECT hints, 
      (SELECT COUNT(*) + 1 FROM public.users u2 WHERE u2.score > u1.score) as rank 
      FROM public.users u1 WHERE user_id = $1`, 
      [user_id]
    );
    
    res.json(data.rows[0] || { hints: 3, rank: '-' });
  } catch (err) {
    console.error("Ошибка в /api/user-info:", err.message);
    res.json({ hints: 3, rank: '-' }); // Отдаем дефолт, чтобы игра не висла
  }
});

// 2. Получение случайной загадки (ИСПРАВЛЕННЫЙ ПОИСК)
app.get('/api/riddle', async (req, res) => {
  const { category } = req.query;
  console.log(`[DEBUG] Игрок запросил категорию: "${category}"`);
  
  try {
    // Ищем загадку, игнорируя лишние пробелы и регистр (лёгкие = Лёгкие)
    const r = await pool.query(
      'SELECT id, question, answer FROM public.riddles WHERE TRIM(category) ILIKE $1 ORDER BY RANDOM() LIMIT 1', 
      [category.trim()]
    );
    
    if (r.rows.length === 0) {
      console.log(`[WARN] Загадки для категории "${category}" не найдены в базе.`);
      return res.status(404).json({ error: "No riddles found" });
    }
    
    console.log(`[SUCCESS] Найдена загадка ID: ${r.rows[0].id}`);
    res.json({ 
      id: r.rows[0].id, 
      question: r.rows[0].question, 
      len: r.rows[0].answer.length 
    });
  } catch (err) {
    console.error("[ERROR] Ошибка в /api/riddle:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. Получение ответа (для проверки и подсказок)
app.get('/api/reveal', async (req, res) => {
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Проверка ответа и начисление очков
app.post('/api/check', async (req, res) => {
  const { user_id, riddle_id, answer } = req.body;
  try {
    const r = await pool.query('SELECT answer FROM public.riddles WHERE id = $1', [riddle_id]);
    if (r.rows[0].answer.toUpperCase() === answer.toUpperCase().trim()) {
      await pool.query('UPDATE public.users SET score = score + 10 WHERE user_id = $1', [user_id]);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Реклама: +3 подсказки
app.post('/api/add-hints-ad', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints + 3 WHERE user_id = $1', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Списание подсказки
app.post('/api/use-hint', async (req, res) => {
  try {
    await pool.query('UPDATE public.users SET hints = hints - 1 WHERE user_id = $1 AND hints > 0', [req.body.user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- АДМИНКА ---

app.get('/api/admin/riddles', async (req, res) => {
  const r = await pool.query('SELECT * FROM public.riddles ORDER BY id DESC');
  res.json(r.rows);
});

app.post('/api/riddles', async (req, res) => {
  const { question, answer, category } = req.body;
  await pool.query(
    'INSERT INTO public.riddles (question, answer, category) VALUES ($1, $2, $3)', 
    [question, answer.toUpperCase().trim(), category]
  );
  res.json({ success: true });
});

app.delete('/api/admin/riddles/:id', async (req, res) => {
  await pool.query('DELETE FROM public.riddles WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// --- БОТ ---

bot.start((ctx) => {
  ctx.reply(`Загадки Смайлика обновлены! ✨`, Markup.inlineKeyboard([
    [Markup.button.webApp('ИГРАТЬ 🏰', process.env.URL)],
    ...(ctx.from.id.toString() === ADMIN_ID ? [[Markup.button.url('АДМИНКА ⚙️', `${process.env.URL}/admin.html`)]] : [])
  ]));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

// dropPendingUpdates: true решает проблему 409 Conflict (зависание бота)
bot.launch({ dropPendingUpdates: true });
