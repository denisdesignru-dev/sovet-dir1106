const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'SOVET_DIRECTOROV_SUPER_SECRET_KEY_2026';
const DB_FILE = './database.sqlite';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация БД
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) console.error(err.message);
    console.log('Подключено к базе данных SQLite.');
});

// Первоначальный запуск таблиц и демо-данных
const initSQL = fs.readFileSync('./init-db.sql', 'utf8');
db.exec(initSQL, async (err) => {
    if (err) return console.error(err);
    
    // Создаем тестовых пользователей, если таблица пуста
    db.get("SELECT count(*) as count FROM users", [], async (err, row) => {
        if (row.count === 0) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);
            
            // Спикер 1 Совета
            db.run(`INSERT INTO users (email, password, role, full_name, board_id) VALUES (?, ?, 'speaker', 'Евгения (Спикер)', 1)`, 
   ['evgenia@test.ru', hashedPassword]
);
            // Резидент 1 Совета
            db.run(`INSERT INTO users (email, password, role, full_name, company, niche, turnover, board_id) VALUES (?, ?, 'resident', 'Белянин Максим', 'ООО АММЕТА ГРУПП', 'Станки и Промтехника', '10.9 млн руб', 1)`);
            
            // Демо-метрики для Максима (ID: 2) за Апрель и Май 2026
            db.run(`INSERT INTO metrics (resident_id, date_period, business_score, team_score, health_score, comments, recommendations) VALUES (2, '2026-04', 6, 5, 7, 'Апрельские итоги', 'Фокус на продажи')`);
            db.run(`INSERT INTO metrics (resident_id, date_period, business_score, team_score, health_score, comments, recommendations) VALUES (2, '2026-05', 8, 7, 6, 'Майские итоги', 'Оптимизировать затраты по рекомендации Евгении')`);
            
            // Демо-события
            db.run(`INSERT INTO events (title, description, event_date, event_type, board_id) VALUES ('Общий Совет Директоров', 'Разбор реальных управленческих решений', '2026-06-24', 'general', 1)`);
            db.run(`INSERT INTO events (title, description, event_date, event_type, board_id, resident_id) VALUES ('Личная стратсессия с Евгенией', 'Приватный разбор рисков под NDA', '2026-06-27', 'private', 1, 2)`);
            
            console.log('Демо-данные успешно загружены. Логин: Пароль: 123456');
        }
    });
});

// Middleware для проверки JWT Токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// API Логина
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Пользователь не найден' });

        // Для демо проверяем напрямую или через bcrypt
        const validPass = (password === '123456') ? true : await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: 'Неверный пароль' });

        const token = jwt.sign({ id: user.id, role: user.role, board_id: user.board_id, name: user.full_name }, JWT_SECRET);
        res.json({ token, role: user.role, name: user.full_name });
    });
});

// API Получения данных Дашборда
app.get('/api/dashboard', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') {
        // Участник видит ТУЛЬКО себя
        db.get("SELECT id, email, full_name, company, niche, turnover, board_id FROM users WHERE id = ?", [req.user.id], (err, profile) => {
            db.all("SELECT * FROM metrics WHERE resident_id = ? ORDER BY date_period ASC", [req.user.id], (err, metrics) => {
                res.json({ type: 'resident', profile, metrics });
            });
        });
    } else if (req.user.role === 'speaker') {
        // Спикер видит список участников СВОЕГО совета
        db.all("SELECT id, full_name, company, niche, turnover FROM users WHERE role = 'resident' AND board_id = ?", [req.user.board_id], (err, residents) => {
            res.json({ type: 'speaker', residents });
        });
    }
});

// API Получения метрик конкретного резидента (для спикера)
app.get('/api/resident/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'speaker') return res.sendStatus(433);
    const residentId = req.params.id;
    db.all("SELECT * FROM metrics WHERE resident_id = ? ORDER BY date_period ASC", [residentId], (err, metrics) => {
        res.json(metrics);
    });
});

// API Обновления/Добавления метрик (Только Спикер)
app.post('/api/metrics/update', authenticateToken, (req, res) => {
    if (req.user.role !== 'speaker') return res.sendStatus(403);
    const { resident_id, date_period, business, team, health, comments, recommendations } = req.body;
    
    db.get("SELECT id FROM metrics WHERE resident_id = ? AND date_period = ?", [resident_id, date_period], (err, row) => {
        if (row) {
            db.run(`UPDATE metrics SET business_score=?, team_score=?, health_score=?, comments=?, recommendations=? WHERE id=?`,
                [business, team, health, comments, recommendations, row.id], () => res.json({ success: true }));
        } else {
            db.run(`INSERT INTO metrics (resident_id, date_period, business_score, team_score, health_score, comments, recommendations) VALUES (?,?,?,?,?,?,?)`,
                [resident_id, date_period, business, team, health, comments, recommendations], () => res.json({ success: true }));
        }
    });
});

// API Календаря (Фильтрация под NDA)
app.get('/api/events', authenticateToken, (req, res) => {
    let query = `SELECT * FROM events WHERE (board_id = ? AND event_type = 'general')`;
    let params = [req.user.board_id];
    
    if (req.user.role === 'resident') {
        query += ` OR (event_type = 'private' AND resident_id = ?)`;
        params.push(req.user.id);
    } else {
        query += ` OR (event_type = 'private')`; // Спикер видит личные встречи
    }

    db.all(query, params, (err, events) => {
        res.json(events);
    });
});

// APIrsvp (Запись на событие)
app.post('/api/events/rsvp', authenticateToken, (req, res) => {
    const { event_id } = req.body;
    db.run("INSERT OR IGNORE INTO rsvp (event_id, user_id) VALUES (?, ?)", [event_id, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
