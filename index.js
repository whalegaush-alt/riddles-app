const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();

// 1. Настройка базы данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Обязательно для Railway
  }
});

// 2. Настройка бота
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  const webAppUrl = process.env.URL;
  
  if (!webAppUrl) {
    return ctx.reply('Ошибка: Переменная URL не настроена!');
  }

  ctx.reply('Готов размять мозги? Нажимай кнопку ниже!', Markup.inlineKeyboard([
    Markup.button.webApp('Открыть загадки 🧩', webAppUrl)
  ]));
});

// 3. Настройка веб-сервера (Express)
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// API эндпоинт для получения загадки
app.get('/api/riddle', async (req, res) => {
  try {
    console.log('--- Попытка получить загадку из БД ---');
    
    // Запрос: берем id, вопрос и ответ. Убрали WHERE, чтобы точно что-то найти
    const result = await pool.query(
      'SELECT id, question, answer FROM riddles ORDER BY RANDOM() LIMIT 1'
    );
    
    console.log('Найдено строк в базе:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('ПРЕДУПРЕЖДЕНИЕ: Таблица riddles существует, но она пустая.');
      return res.status(404).json({ error: 'Загадки в базе не найдены' });
    }
    
    console.log('Отправляем загадку клиенту:', result.rows[0].question);
    res.json(result.rows[0]);
    
  } catch (err) {
    console.error('ОШИБКА ВЫПОЛНЕНИЯ ЗАПРОСА К БД:', err.message);
    res.status(500).json({ error: 'Ошибка базы данных: ' + err.message });
  }
});

// Проверка связи
app.get('/health', (req, res) => {
  res.send('Сервер активен!');
});

// Запуск сервера на порту Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`--- СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT} ---`);
});

// Запуск бота
bot.launch()
  .then(() => console.log('--- ТЕЛЕГРАМ БОТ ЗАПУЩЕН ---'))
  .catch((err) => console.error('Ошибка запуска бота:', err));

// Мягкая остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
