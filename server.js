const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = 'sovet_directors_ultra_secret_key_2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- БАЗА ДАННЫХ В ПАМЯТИ СЕРВЕРА (IN-MEMORY DB) ---

// Пользователи системы
const users = [
    { id: 1, email: 'белянин@test.ru', passwordHash: bcrypt.hashSync('123456', 10), role: 'resident', fullName: 'Белянин Максим Николаевич' },
    { id: 2, email: 'admin@test.ru', passwordHash: bcrypt.hashSync('123456', 10), role: 'admin', fullName: 'Главный Методолог' }
];

// Профили резидентов (Данные извлечены из официального отчёта Совета Директоров)
const profiles = {
    1: {
        full_name: 'Белянин Максим Николаевич',
        company: 'ООО «АММЕТА ГРУПП»',
        niche: 'Обработка и сервис промышленного оборудования (станки)',
        turnover: '10,9 млн руб. (2025)'
    }
};

// Историческая динамика аспектных срезов (Сферы жизни Максима Белянина за Апрель и Май)
let metricsData = [
    {
        id: 101,
        resident_id: 1,
        date_period: 'Апрель 2026',
        health_score: 7,
        relations_score: 7,
        business_score: 7,
        team_score: 4,
        recommendations: 'Анализ рисков работы по тайваньскому направлению. Рекомендована постепенная диверсификация.'
    },
    {
        id: 102,
        resident_id: 1,
        date_period: 'Май 2026',
        health_score: 8,
        relations_score: 6,
        business_score: 4,
        team_score: 7,
        recommendations: 'Сформировать и разделить стратегические и операционные риски поставщиков. Подготовить альтернативные логистические маршруты через материковый Китай для минимизации задержек на таможне.'
    }
];

// Мероприятия платформы (Базовое расписание Советов на Июнь 2026)
let events = [
    { id: 1, event_date: '2026-06-11', event_time: '14:00', title: 'Разбор затрат и оптимизация ФОТ', address: 'Пресненская наб., 12, Башня Федерация' },
    { id: 2, event_date: '2026-06-11', event_time: '18:00', title: 'Закрытый ужин Клуба', address: 'ул. Тверская, 3, Ресторан Grand' },
    { id: 3, event_date: '2026-06-27', event_time: '11:00', Strategic: true, title: 'Регулярный Совет Директоров', address: 'Локация Платформы' }
];

// Статусы присутствия резидентов (RSVP)
let rsvps = [
    { event_id: 3, resident_id: 1, status: 'going' } // По умолчанию записан на общий Совет 27 июня
];

// --- МИДЛВЕЙР АВТЕНТИФИКАЦИИ ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(01).json({ error: 'Доступ заблокирован. Требуется авторизация.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Сессия истекла или недействительна.' });
        req.user = user;
        next();
    });
}

// --- API ЭНДПОИНТЫ ---

// 1. Авторизация
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный логин или пароль.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, fullName: user.fullName }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
});

// 2. Данные панели управления (Экран 1)
app.get('/api/dashboard', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') {
        const profile = profiles[req.user.id] || { full_name: req.user.fullName, company: '-', niche: '-', turnover: '-' };
        const myMetrics = metricsData.filter(m => m.resident_id === req.user.id);
        
        res.json({
            type: 'resident',
            profile,
            metrics: myMetrics
        });
    } else {
        // Ответ для методолога: отдаём список всех резидентов для контроля
        const residentsRegistry = users
            .filter(u => u.role === 'resident')
            .map(u => ({
                id: u.id,
                full_name: u.fullName,
                company: profiles[u.id]?.company || '-',
                niche: profiles[u.id]?.niche || '-'
            }));
            
        res.json({
            type: 'speaker', // роли методолога/спикера идентичны в системе прав
            residents: residentsRegistry
        });
    }
});

// 3. Выборка конкретного резидента методологом
app.get('/api/resident/:id', authenticateToken, (req, res) => {
    const resId = parseInt(req.params.id);
    const data = metricsData.filter(m => m.resident_id === resId);
    res.json(data);
});

// 4. Фиксация срезов резидентом (Самооценка)
app.post('/api/metrics', authenticateToken, (req, res) => {
    if (req.user.role !== 'resident') return res.status(403).json({ error: 'Только резиденты могут оценивать свои сферы жизни.' });
    
    const { period, business, team, health, relations } = req.body;
    
    // Проверяем, вносил ли уже оценки за этот период
    const existingIndex = metricsData.findIndex(m => m.resident_id === req.user.id && m.date_period === period);
    
    if (existingIndex !== -1) {
        metricsData[existingIndex].business_score = parseInt(business);
        metricsData[existingIndex].team_score = parseInt(team);
        metricsData[existingIndex].health_score = parseInt(health);
        metricsData[existingIndex].relations_score = parseInt(relations);
    } else {
        metricsData.push({
            id: Date.now(),
            resident_id: req.user.id,
            date_period: period,
            business_score: parseInt(business),
            team_score: parseInt(team),
            health_score: parseInt(health),
            relations_score: parseInt(relations),
            recommendations: ''
        });
    }
    res.json({ message: 'Срезы аспектов жизни успешно зафиксированы в аналитической базе.' });
});

// 5. Внесение комментариев/директив методологом
app.post('/api/metrics/update', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Недостаточно прав доступа.' });
    
    const { resident_id, date_period, recommendations } = req.body;
    const item = metricsData.find(m => m.resident_id === parseInt(resident_id) && m.date_period === date_period);
    
    if (item) {
        item.recommendations = recommendations;
    } else {
        metricsData.push({
            id: Date.now(),
            resident_id: parseInt(resident_id),
            date_period: date_period,
            business_score: 5, team_score: 5, health_score: 5, relations_score: 5, // Дефолтные значения, если резидент ещё не заходил
            recommendations: recommendations
        });
    }
    res.json({ message: 'Директивы сохранены.' });
});

// --- РУТЫ ПОЛНОЦЕННОГО КАЛЕНДАРЯ (ЭКРАН 2) ---

// 6. Получение всех событий за выбранный месяц с учётом RSVP статусов текущего юзера
app.get('/api/events/month/:yearMonth', authenticateToken, (req, res) => {
    const target = req.params.yearMonth; // Например "2026-06"
    
    // Фильтруем события, у которых дата начинается с нужного "YYYY-MM"
    const monthlyEvents = events.filter(e => e.event_date.startsWith(target));
    
    // Извлекаем RSVP записи только для текущего авторизованного пользователя
    const myRsvps = rsvps.filter(r => r.resident_id === req.user.id);
    
    res.json({
        events: monthlyEvents,
        rsvps: myRsvps
    });
});

// 7. Фиксация безотзывного выбора (Я буду / Не в этот раз)
app.post('/api/events/rsvp', authenticateToken, (req, res) => {
    const { event_id, status } = req.body;
    
    // Проверяем, нет ли уже существующего RSVP выбора для этой встречи
    const existing = rsvps.find(r => r.event_id === parseInt(event_id) && r.resident_id === req.user.id);
    
    if (existing) {
        return res.status(400).json({ error: 'Выбор уже зафиксирован на сервере платформы. Изменение или отмена решения невозможны.' });
    }
    
    rsvps.push({
        event_id: parseInt(event_id),
        resident_id: req.user.id,
        status: status // 'going' или 'declined'
    });
    
    res.json({ success: true });
});

// 8. Создание нового события методологом
app.post('/api/events/create', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const { title, event_date, event_time, address } = req.body;
    
    const newEvent = { id: Date.now(), title, event_date, event_time, address };
    events.push(newEvent);
    res.json(newEvent);
});

// 9. Редактирование события
app.put('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const eventId = parseInt(req.params.id);
    const { title, event_time, address } = req.body;
    
    const item = events.find(e => e.id === eventId);
    if (item) {
        item.title = title;
        item.event_time = event_time;
        item.address = address;
        return res.json(item);
    }
    res.status(404).json({ error: 'Событие не найдено' });
});

// 10. Удаление события из сетки календаря
app.delete('/api/events/:id', authenticateToken, (req, res) => {
    if (req.user.role === 'resident') return res.status(403).json({ error: 'Запрещено.' });
    const eventId = parseInt(req.params.id);
    events = events.filter(e => e.id !== eventId);
    res.json({ success: true });
});

// Перенаправление на фронтенд для всех остальных путей
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[OK] Платформа Совета Директоров развернута на порту ${PORT}`);
});
