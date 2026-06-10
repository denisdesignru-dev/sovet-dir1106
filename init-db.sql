-- Таблица пользователей (Резиденты и Спикеры)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'resident', 'speaker'
    full_name TEXT NOT NULL,
    company TEXT,
    niche TEXT,
    turnover TEXT,
    board_id INTEGER NOT NULL -- Номер Совета (1, 2, 3...)
);

-- Таблица ежемесячного трекинга и оценок
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resident_id INTEGER NOT NULL,
    date_period TEXT NOT NULL, -- Формат 'YYYY-MM' (например, '2026-04')
    business_score INTEGER DEFAULT 1, -- Оценка от 1 до 10
    team_score INTEGER DEFAULT 1,
    health_score INTEGER DEFAULT 1,
    comments TEXT, -- Заметки методолога
    recommendations TEXT, -- Советы спикеров
    FOREIGN KEY(resident_id) REFERENCES users(id)
);

-- Таблица календаря встреч
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL, -- Формат 'YYYY-MM-DD'
    event_type TEXT NOT NULL, -- 'general' (общий совет) или 'private' (личная встреча)
    board_id INTEGER, -- Для какого совета встреча (NULL если для всех)
    resident_id INTEGER -- Если встреча приватная, ID конкретного резидента
);

-- Таблица откликов на события (RSVP)
CREATE TABLE IF NOT EXISTS rsvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'going',
    UNIQUE(event_id, user_id),
    FOREIGN KEY(event_id) REFERENCES events(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);
