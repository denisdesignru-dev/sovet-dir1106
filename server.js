const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = 'sovet_directors_ultra_secret_key_2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- IN-MEMORY DB ---
let users = [
    { id: 1, email: 'белянин@test.ru', passwordHash: bcrypt.hashSync('123456', 10), role: 'resident', fullName: 'Белянин Максим Николаевич' },
    { id: 2, email: 'admin@test.ru', passwordHash: bcrypt.hashSync('123456', 10), role: 'admin', fullName: 'Главный Методолог' }
];

let profiles = {
    1: {
        full_name: 'Белянин Максим Николаевич',
        company: 'ООО «АММЕТА ГРУПП»',
        niche: 'Обработка и сервис промышленного оборудования (станки)',
        turnover: '10,9 млн руб. (2025)',
        entry_request: 'Определить ключевые ограничения роста компании, провести диагностику партнёрства и управленческой модели, сформировать стратегический фокус.'
    }
};

let metricsData = [
    {
        id: 102,
        resident_id: 1,
        date_period: 'Май 2026',
        health_score: 8,
        relations_score: 6,
        business_score: 4,
        team_score: 7,
        recommendations: 'Сформировать и разделить стратегические и операционные риски поставщиков.',
        // Детализированные вкладки итогов
        summary_title: 'Совет Директоров Май',
        summary_date: '2026-05-24',
        summary_topic: 'Разбор реальных управленческих решений: где скрыт перегруз по затратам.',
        summary_content: 'Встреча была посвящена вопросам адаптации бизнеса к замедлению рынка.',
        summary_requests: 'Оценка рисков работы с производителем под санкциями.',
        recs_title: 'Диверсификация направлений',
        recs_desc: 'Рекомендовано рассматривать ситуацию как риск зависимости от одного крупного поставщика.'
    }
];

let events = [
    { id: 1, event_date: '2026-06-11', event_time: '14:00', title: 'Разбор затрат и оптимизация ФОТ', address: 'Пресненская наб., 12, Башня Федерация' },
    { id: 2, event_date: '2026-06-11', event_time: '18:00', title: 'Закрытый ужин Клуба', address: 'ул. Тверская, 3, Ресторан Grand' },
    { id: 3, event_date: '2026-06-27', event_time: '11:00', title: 'Регулярный Совет Директоров', address: 'Локация Платформы' }
];

let rsvps = [
    { event_id: 3, resident_id: 1, status: 'going', fullName: 'Белянин Максим Николаевич' }
];

// Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Сессия недействительна.' });
        req.user = user;
        next();
    });
}

// Руты авторизации и ЛК
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный логин или пароль.' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, fullName: user.fullName }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
});

app.get('/api/dashboard', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') {
        res.json({ type: 'resident', profile: profiles[req.user.id] || {}, metrics: metricsData.filter(m => m.resident_id === req.user.id) });
    } else {
        const registry = users.filter(u => u.role === 'resident').map(u => ({
            id: u.id,
            full_name: u.fullName,
            company: profiles[u.id]?.company || '-',
            niche: profiles[u.id]?.niche || '-',
            turnover: profiles[u.id]?.turnover || '-'
        }));
        res.json({ type: 'speaker', residents: registry });
    }
});

// Добавление нового резидента методологом
app.post('/api/residents/create', checkAuth, (req, res) => {
    if (req.user.type !== 'speaker' && req.user.type !== 'admin') {
        return res.status(403).json({ error: 'Нет доступа' });
    }
    const { fullName, email, company, niche, turnover, entryRequest } = req.body;
    
    // Используем email переданный из формы
    if (!email) {
        return res.status(400).json({ error: 'Email обязателен к заполнению' });
    }

    // Хешируем стандартный пароль "123456" для нового пользователя
    const passwordHash = bcrypt.hashSync('123456', 10);

    // Подключаем логику записи в вашу базу данных:
    db.run("INSERT INTO users (email, password, type) VALUES (?, ?, 'resident')", [email, passwordHash], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Пользователь с таким Email уже существует или ошибка БД' });
        }
        const userId = this.lastID; // получаем ID только что созданного пользователя

        // Теперь записываем данные в таблицу профилей резидентов
        db.run(
            "INSERT INTO residents (user_id, full_name, company, niche, turnover, entry_request) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, fullName, company, niche, turnover, entryRequest],
            function(profileErr) {
                if (profileErr) {
                    return res.status(500).json({ error: 'Ошибка при создании профиля резидента' });
                }
                res.json({ success: true, email: email });
            }
        );
    });
});

    profiles[nextId] = {
        full_name: fullName,
        company,
        niche,
        turnover,
        entry_request: entryRequest
    };

    res.json({ success: true, email: generatedEmail });
});

app.get('/api/resident/:id', authenticateToken, (req, res) => {
    const resId = parseInt(req.params.id);
    res.json({
        profile: profiles[resId] || {},
        metrics: metricsData.filter(m => m.resident_id === resId)
    });
});

// Сохранение комплексных итогов встречи и рекомендаций методологом
app.post('/api/metrics/extended-update', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const { resident_id, date_period, summary_title, summary_date, summary_topic, summary_content, summary_requests, recs_title, recs_desc } = req.body;
    
    let item = metricsData.find(m => m.resident_id === parseInt(resident_id) && m.date_period === date_period);
    if (!item) {
        item = { id: Date.now(), resident_id: parseInt(resident_id), date_period, business_score: 5, team_score: 5, health_score: 5, relations_score: 5 };
        metricsData.push(item);
    }

    item.summary_title = summary_title;
    item.summary_date = summary_date;
    item.summary_topic = summary_topic;
    item.summary_content = summary_content;
    item.summary_requests = summary_requests;
    item.recs_title = recs_title;
    item.recs_desc = recs_desc;
    item.recommendations = `${recs_title}: ${recs_desc}`; // Для обратной совместимости вывода в ЛК

    res.json({ success: true });
});

// Фиксация самооценки резидента
app.post('/api/metrics', authenticateToken, (req, res) => {
    const { period, business, team, health, relations } = req.body;
    let item = metricsData.find(m => m.resident_id === req.user.id && m.date_period === period);
    if (item) {
        Object.assign(item, { business_score: parseInt(business), team_score: parseInt(team), health_score: parseInt(health), relations_score: parseInt(relations) });
    } else {
        metricsData.push({ id: Date.now(), resident_id: req.user.id, date_period: period, business_score: parseInt(business), team_score: parseInt(team), health_score: parseInt(health), relations_score: parseInt(relations), recommendations: '' });
    }
    res.json({ message: 'Срезы успешно сохранены.' });
});

// Календарь событий и RSVP списки участников
app.get('/api/events/month/:yearMonth', authenticateToken, (req, res) => {
    const target = req.params.yearMonth;
    const monthlyEvents = events.filter(e => e.event_date.startsWith(target));
    
    // Для каждого события собираем развернутые списки подтвердивших и отказавшихся
    const enrichedEvents = monthlyEvents.map(e => {
        const eventRsvps = rsvps.filter(r => r.event_id === e.id);
        return {
            ...e,
            going_count: eventRsvps.filter(r => r.status === 'going').length,
            declined_count: eventRsvps.filter(r => r.status === 'declined').length,
            attendees: eventRsvps.map(r => ({ fullName: r.fullName, status: r.status }))
        };
    });

    res.json({ events: enrichedEvents, rsvps: rsvps.filter(r => r.resident_id === req.user.id) });
});

app.post('/api/events/rsvp', authenticateToken, (req, res) => {
    const { event_id, status } = req.body;
    const existing = rsvps.find(r => r.event_id === parseInt(event_id) && r.resident_id === req.user.id);
    if (existing) return res.status(400).json({ error: 'Ваш выбор уже зафиксирован на сервере.' });

    rsvps.push({ event_id: parseInt(event_id), resident_id: req.user.id, status, fullName: req.user.fullName });
    res.json({ success: true });
});

app.post('/api/events/create', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const { title, event_date, event_time, address } = req.body;
    const newEvent = { id: Date.now(), title, event_date, event_time, address };
    events.push(newEvent);
    res.json(newEvent);
});

app.put('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const item = events.find(e => e.id === parseInt(req.params.id));
    if (item) {
        Object.assign(item, req.body);
        return res.json(item);
    }
    res.status(404).json({ error: 'Не найдено' });
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    events = events.filter(e => e.id !== parseInt(req.params.id));
    res.json({ success: true });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`[OK] Server running on port ${PORT}`); });

// Метод сохранения расширенных метрик /api/metrics/extended-update на бэкенде 
// гарантирует запись полей summary_* и recs_*, которые теперь полностью 
// отображаются на фронтенде в функции openSpeakerEditor.
