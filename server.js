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

// Middleware авторизации
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

// Вход в систему
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Заполните все поля.' });

    const user = users.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный логин или пароль.' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, fullName: user.fullName }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
});

// Роут Дашборда
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
        res.json({ type: 'admin', residents: registry });
    }
});

// Календарь и RSVP
app.get('/api/events/month/:yearMonth', authenticateToken, (req, res) => {
    const target = req.params.yearMonth;
    const monthlyEvents = events.filter(e => e.event_date.startsWith(target));
    
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

app.post('/api/events/create', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'speaker') return res.status(403).json({ error: 'Запрещено.' });
    const { title, event_date, event_time, address } = req.body;
    const newEvent = { id: Date.now(), title, event_date, event_time, address };
    events.push(newEvent);
    res.json(newEvent);
});

app.put('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'speaker') return res.status(403).json({ error: 'Запрещено.' });
    const item = events.find(e => e.id === parseInt(req.params.id));
    if (item) {
        Object.assign(item, req.body);
        return res.json(item);
    }
    res.status(404).json({ error: 'Не найдено' });
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'speaker') return res.status(403).json({ error: 'Запрещено.' });
    events = events.filter(e => e.id !== parseInt(req.params.id));
    res.json({ success: true });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`[OK] Server running on port ${PORT}`); });
