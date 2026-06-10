let token = localStorage.getItem('token') || '';
let currentRole = ''; // 'resident' или 'speaker'/'admin'
let myChart = null;
let selectedResidentId = null;

// Состояние календаря
let currentSelectedDateStr = ''; // Формат: "YYYY-MM-DD"
let cachedEvents = [];
let cachedRsvps = [];

// Локальное состояние ползунков резидента
const residentRatings = { business: 5, team: 5, health: 5, relations: 5 };

if (token) showMainSystem();

// Синхронизация ползунков и инпутов резидента
function syncSlider(metric, val) {
    let checkedVal = parseInt(val);
    if (isNaN(checkedVal) || checkedVal < 1) checkedVal = 1;
    if (checkedVal > 10) checkedVal = 10;
    
    residentRatings[metric] = checkedVal;
    document.getElementById(`range-${metric}`).value = checkedVal;
    document.getElementById(`num-${metric}`).value = checkedVal;
}

// --- АВТОРИЗАЦИЯ И СИСТЕМА ---
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(res.ok) {
        token = data.token;
        localStorage.setItem('token', token);
        showMainSystem();
    } else {
        document.getElementById('login-error').innerText = data.error;
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    location.reload();
}

function showMainSystem() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    loadDashboardData();
}

// --- ПАНЕЛЬ УПРАВЛЕНИЯ (ЭКРАН 1) ---
async function loadDashboardData() {
    const res = await fetch('/api/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    currentRole = data.type;
    
    document.getElementById('user-display-name').innerText = data.type === 'resident' ? 'Резидент' : 'Методолог (Админ)';

    if (data.type === 'resident') {
        document.getElementById('resident-view').classList.remove('hidden');
        document.getElementById('speaker-view').classList.add('hidden');
        
        document.getElementById('res-name').innerText = data.profile.full_name;
        document.getElementById('res-company').innerText = data.profile.company;
        document.getElementById('res-niche').innerText = data.profile.niche;
        document.getElementById('res-turnover').innerText = data.profile.turnover;
        
        // Отрисовка комментариев (директив) от методолога
        const recBlock = document.getElementById('recommendations-block');
        recBlock.innerHTML = data.metrics.map(m => `
            <div class="rec-item-card">
                <strong>Период: ${m.date_period}</strong>
                <p style="margin-top:8px; font-size:0.9rem; color:#e0e0e0;">${m.recommendations || 'Комментарии от методолога к этому месяцу пока отсутствуют.'}</p>
            </div>
        `).join('');
        
        renderChart(data.metrics);
    } else {
        // Интерфейс Методолога: только реестр участников и блок комментариев
        document.getElementById('speaker-view').classList.remove('hidden');
        document.getElementById('resident-view').classList.add('hidden');
        
        const listContainer = document.getElementById('residents-list');
        listContainer.innerHTML = data.residents.map(r => `
            <div class="resident-item" onclick="openSpeakerEditor(${r.id}, '${r.full_name}')">
                <h4>${r.full_name}</h4>
                <p>${r.company} (${r.niche})</p>
            </div>
        `).join('');
    }
}

function renderChart(metrics) {
    const ctx = document.getElementById('metricsChart').getContext('2d');
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: metrics.map(m => m.date_period),
            datasets: [
                { label: 'Бизнес', data: metrics.map(m => m.business_score), borderColor: '#b59473', tension: 0.2, backgroundColor: 'transparent' },
                { label: 'Команда', data: metrics.map(m => m.team_score), borderColor: '#ffffff', tension: 0.2, backgroundColor: 'transparent' },
                { label: 'Здоровье', data: metrics.map(m => m.health_score), borderColor: '#ff4444', tension: 0.2, backgroundColor: 'transparent' },
                { label: 'Отношения', data: metrics.map(m => m.relations_score), borderColor: '#2ecc71', tension: 0.2, backgroundColor: 'transparent' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#82807b' } } } }
    });
}

// Резидент отправляет свои оценки
async function saveResidentSelfMetrics(event) {
    event.preventDefault();
    const period = document.getElementById('periodSelect').value;
    const res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ period, ...residentRatings })
    });
    const data = await res.json();
    if(res.ok) { alert(data.message); loadDashboardData(); } else { alert(data.error); }
}

// Открытие методологом карточки резидента для добавления комментариев
async function openSpeakerEditor(residentId, name) {
    selectedResidentId = residentId;
    document.getElementById('editor-block').classList.remove('hidden');
    document.getElementById('edit-resident-title').innerText = `Анализ и комментарии: ${name}`;
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const metrics = await res.json();
    if(metrics.length > 0) {
        const last = metrics[metrics.length - 1];
        document.getElementById('edit-recs').value = last.recommendations || '';
    } else {
        document.getElementById('edit-recs').value = '';
    }
}

async function saveSpeakerRecommendations() {
    const payload = {
        resident_id: selectedResidentId,
        date_period: document.getElementById('edit-period').value,
        recommendations: document.getElementById('edit-recs').value
    };
    const res = await fetch('/api/metrics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    if(res.ok) { alert('Комментарии успешно сохранены в ЛК резидента.'); loadDashboardData(); }
}


// --- ПОЛНОЦЕННЫЙ ГУГЛ КАЛЕНДАРЬ (ЭКРАН 2) ---
async function renderGoogleCalendar() {
    const pickerVal = document.getElementById('calendarMonthPicker').value; // "YYYY-MM"
    const [year, month] = pickerVal.split('-').map(Number);
    
    const res = await fetch(`/api/events/month/${pickerVal}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    cachedEvents = data.events;
    cachedRsvps = data.rsvps;

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    document.getElementById('calendar-month-title').innerText = `${monthNames[month - 1]} ${year}`;

    const container = document.getElementById('calendar-days-container');
    container.innerHTML = '';

    const firstDayIndex = new Date(year, month - 1, 1).getDay();
    const shiftedIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Сдвиг под Пн-Вс
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    // Пустые ячейки начала месяца
    for (let i = 0; i < shiftedIndex; i++) {
        const blank = document.createElement('div');
        blank.className = 'calendar-day-cell empty-cell';
        container.appendChild(blank);
    }

    // Ровно столько ячеек, сколько дней в этом месяце
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        
        const dayStr = String(day).padStart(2, '0');
        const fullDateStr = `${pickerVal}-${dayStr}`;
        
        cell.onclick = () => openDayModal(fullDateStr);

        const todayStr = new Date().toISOString().split('T')[0];
        if(fullDateStr === todayStr) cell.classList.add('current-day');

        cell.innerHTML = `<span class="cell-day-number">${day}</span>`;

        // Базовая информация о мероприятиях в ячейке (название и время)
        const dayEvents = cachedEvents.filter(e => e.event_date === fullDateStr);
        dayEvents.forEach(e => {
            const badge = document.createElement('div');
            badge.className = 'micro-event-badge';
            badge.innerText = `${e.event_time} ${e.title}`;
            cell.appendChild(badge);
        });

        container.appendChild(cell);
    }
}

// Открытие дня
function openDayModal(dateStr) {
    currentSelectedDateStr = dateStr;
    document.getElementById('day-modal').classList.remove('hidden');
    document.getElementById('modal-day-title').innerText = `Расписание на ${dateStr}`;

    // Отображение кнопки "+" в правом нижнем углу только для методолога
    if(currentRole === 'speaker' || currentRole === 'admin') {
        document.getElementById('floating-add-btn').classList.remove('hidden');
    } else {
        document.getElementById('floating-add-btn').classList.add('hidden');
    }

    renderDayEventsDetails();
}

function closeDayModal(e) {
    if(!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) {
        document.getElementById('day-modal').classList.add('hidden');
    }
}

// Генерация расписания дня по часам и карточек встреч
function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    listContainer.innerHTML = '';

    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);
    dayEvents.sort((a,b) => a.event_time.localeCompare(b.event_time));

    // Обновляем визуальный интерактив для левой шкалы времени методолога
    const timeSlots = document.querySelectorAll('.time-slot');
    timeSlots.forEach(slot => {
        // Убираем старые метки занятости
        slot.classList.remove('has-event');
        const hour = slot.getAttribute('data-hour');
        
        // Переназначаем клик для методолога
        if (currentRole === 'speaker' || currentRole === 'admin') {
            slot.onclick = () => triggerCreateEvent(hour);
        } else {
            slot.onclick = null;
        }
    });

    if(dayEvents.length === 0) {
        listContainer.innerHTML = `<p class="event-meta-text" style="padding:20px; text-align:center; color: var(--text-muted);">Встреч на этот день не запланировано.</p>`;
        return;
    }

    dayEvents.forEach(e => {
        // Подсвечиваем час на левой панели, если там есть событие
        const eventHour = e.event_time.split(':')[0] + ':00';
        const matchingSlot = document.querySelector(`.time-slot[data-hour="${eventHour}"]`);
        if (matchingSlot) matchingSlot.classList.add('has-event');

        const rsvp = cachedRsvps.find(r => r.event_id === e.id);
        
        let statusText = 'Подтвердите участие';
        let statusClass = 'status-pending';
        let buttonsHtml = '';

        if (!rsvp) {
            // Статус по умолчанию и 2 кнопки управления для резидента
            statusText = 'Подтвердите участие';
            statusClass = 'status-pending';
            buttonsHtml = `
                <div class="rsvp-actions-flex">
                    <button class="btn-rsvp-yes" onclick="openConfirmDialogue(${e.id}, 'going')">Я буду</button>
                    <button class="btn-rsvp-no" onclick="openConfirmDialogue(${e.id}, 'declined')">Не в этот раз</button>
                </div>
            `;
        } else if (rsvp.status === 'going') {
            statusText = 'Вы записаны';
            statusClass = 'status-going';
        } else if (rsvp.status === 'declined') {
            statusText = 'Вы отказались от участия';
            statusClass = 'status-declined';
        }

        const card = document.createElement('div');
        card.className = 'detailed-event-card';
        
        // Контент карточки (Вся информация: Название, Адрес, Время, Статус)
        let cardBody = `
            <div class="event-info-clickable">
                <h4>${e.title}</h4>
                <p class="event-meta-text">🕒 Время начала: <strong>${e.event_time}</strong></p>
                <p class="event-meta-text">📍 Адрес проведения: <strong>${e.address}</strong></p>
                <span class="event-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;

        card.innerHTML = cardBody + (currentRole === 'resident' ? buttonsHtml : '');

        // Если зашел методолог — клик по самой карточке открывает окно редактирования/удаления
        if (currentRole === 'speaker' || currentRole === 'admin') {
            card.style.cursor = 'pointer';
            card.querySelector('.event-info-clickable').onclick = () => {
                triggerEditEvent(e.id, e.title, e.event_time, e.address);
            };
        }

        listContainer.appendChild(card);
    });
}

// --- ЛОГИКА ДИАЛОГОВЫХ ОКН ПОДТВЕРЖДЕНИЯ (БЕЗ ОТМЕНЫ ПОСЛЕ "ДА") ---
function openConfirmDialogue(eventId, decision) {
    const modal = document.getElementById('club-confirm-modal');
    const text = document.getElementById('confirm-modal-text');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const noBtn = document.getElementById('confirm-no-btn');

    // Настройка кастомного текста под выбранную кнопку
    if (decision === 'going') {
        text.innerText = "Подтверждаете участие?";
    } else {
        text.innerText = "Вы точно хотите отказаться от участия?";
    }

    modal.classList.remove('hidden');

    // Кнопка "Да" — фиксирует выбор на сервере, отменить больше нельзя
    yesBtn.onclick = async () => {
        modal.classList.add('hidden');
        const res = await fetch('/api/events/rsvp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ event_id: eventId, status: decision })
        });
        
        if (res.ok) {
            // Перерисовываем сетку и карточки с новыми статусами "Вы записаны" / "Вы отказались"
            await renderGoogleCalendar();
            renderDayEventsDetails();
        } else {
            const errData = await res.json();
            alert(errData.error);
        }
    };

    // Кнопка "Отмена" — просто закрывает всплывающее окно
    noBtn.onclick = () => {
        modal.classList.add('hidden');
    };
}

// --- МЕНЕДЖМЕНТ СОБЫТИЙ МЕТОДОЛОГОМ (CRUD) ---
function triggerCreateEvent(hourStr) {
    document.getElementById('editor-modal-title').innerText = "Настройка стратегического события";
    document.getElementById('edit-event-id').value = '';
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-time-input').value = hourStr; // Автоподстановка часа из строки клика
    document.getElementById('event-address-input').value = '';
    document.getElementById('btn-delete-event').style.display = 'none';
    document.getElementById('event-editor-modal').classList.remove('hidden');
}

function triggerEditEvent(id, title, time, address) {
    document.getElementById('editor-modal-title').innerText = "Редактировать событие";
    document.getElementById('edit-event-id').value = id;
    document.getElementById('event-title-input').value = title;
    document.getElementById('event-time-input').value = time;
    document.getElementById('event-address-input').value = address;
    document.getElementById('btn-delete-event').style.display = 'block'; // Позволяем удалить
    document.getElementById('event-editor-modal').classList.remove('hidden');
}

function closeEditorModal() { 
    document.getElementById('event-editor-modal').classList.add('hidden'); 
}

async function saveEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('event-title-input').value;
    const event_time = document.getElementById('event-time-input').value;
    const address = document.getElementById('event-address-input').value;

    if(!title || !event_time || !address) return alert("Все поля (Название, Время, Адрес) обязательны к заполнению.");

    let url = '/api/events/create';
    let method = 'POST';
    let body = { title, event_date: currentSelectedDateStr, event_time, address };

    if(id) { 
        url = `/api/events/${id}`; 
        method = 'PUT'; 
        body = { title, event_time, address }; 
    }

    const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
    });

    if(res.ok) {
        closeEditorModal();
        await renderGoogleCalendar();
        renderDayEventsDetails();
    }
}

async function deleteEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    if(!id) return;
    
    if(confirm("Удалить данное мероприятие из сетки календаря?")) {
        const res = await fetch(`/api/events/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if(res.ok) {
            closeEditorModal();
            await renderGoogleCalendar();
            renderDayEventsDetails();
        }
    }
}

// Табы управления
function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if(tab === 'calendar') renderGoogleCalendar();
}
