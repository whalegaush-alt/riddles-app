const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Раздаем статические файлы из папки frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Команда /start
bot.start((ctx) => {
  const webAppUrl = process.env.URL; // Эту ссылку мы вставим позже в Railway
  ctx.reply('Добро пожаловать! Разгадай наши загадки:', Markup.inlineKeyboard([
    Markup.button.webApp('Открыть загадки', webAppUrl || 'https://google.com')
  ]));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

bot.launch();
