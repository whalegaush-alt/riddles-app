// ... (начало кода без изменений)

// Получить полный ответ и ПОЯСНЕНИЕ
app.get('/api/reveal', async (req, res) => {
  try {
    const result = await pool.query('SELECT answer, explanation FROM public.riddles WHERE id = $1', [req.query.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Создание загадки (с пояснением)
app.post('/api/riddles', async (req, res) => {
  const { question, answer, category, explanation } = req.body;
  try {
    await pool.query('INSERT INTO public.riddles (question, answer, category, explanation) VALUES ($1, $2, $3, $4)', 
    [question, answer.toUpperCase().trim(), category, explanation]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Редактирование (с пояснением)
app.put('/api/riddles/:id', async (req, res) => {
  const { question, answer, category, explanation } = req.body;
  try {
    await pool.query('UPDATE public.riddles SET question=$1, answer=$2, category=$3, explanation=$4 WHERE id=$5', 
    [question, answer.toUpperCase().trim(), category, explanation, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ... (остальной код)
