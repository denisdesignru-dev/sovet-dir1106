let token = localStorage.getItem('token') || '';
let currentRole = ''; 
let myChart = null;
let selectedResidentId = null;

let currentSelectedDateStr = ''; 
let cachedEvents = [];
let cachedRsvps = [];

const residentRatings = { business: 5, team: 5, health: 5, relations: 5 };

if (token) showMainSystem();

function syncSlider(metric, val) {
    let checkedVal = parseInt(val);
    if (isNaN(checkedVal) || checkedVal < 1) checkedVal = 1;
    if (checkedVal > 10) checkedVal = 10;
    
    residentRatings[metric] = checkedVal;
    document.getElementById(`range-${metric}`).value = checkedVal;
    document.getElementById(`num-${metric}`).value = checkedVal;
}

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
        
        const recBlock = document.getElementById('recommendations-block');
        recBlock.innerHTML = data.metrics.map(m => `
            <div style="background:#1a1a1a; padding:15px; border-radius:6px; margin-bottom:10px; border:1px solid #222;">
                <strong>Период: ${m.date_period}</strong>
                <p style="margin-top:8px; font-size:0.9rem; color:#e0e0e0;">${m.recommendations || 'Комментарии от методолога пока отсутствуют.'}</p>
            </div>
        `).join('');
        
        renderChart(data.metrics);
    } else {
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
    if(res.ok) { alert('Комментарии успешно сохранены.'); loadDashboardData(); }
}

// --- ИСПРАВЛЕННАЯ ОТРИСОВКА КАЛЕНДАРЯ ---
async function renderGoogleCalendar() {
    const pickerVal = document.getElementById('calendarMonthPicker').value; // Формат "YYYY-MM"
    if (!pickerVal) return;

    const [year, month] = pickerVal.split('-').map(Number);
    
    const res = await fetch(`/api/events/month/${pickerVal}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    cachedEvents = data.events || [];
    cachedRsvps = data.rsvps || [];

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    document.getElementById('calendar-month-title').innerText = `${monthNames[month - 1]} ${year}`;

    const container = document.getElementById('calendar-days-container');
    container.innerHTML = '';

    // Вычисляем день недели для 1-го числа текущего месяца (0 = Вс, 1 = Пн...)
    let firstDayIndex = new Date(year, month - 1, 1).getDay();
    // Корректируем под наш формат (Пн = 0, Вс = 6)
    let shiftedIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 
    
    // Вычисляем общее количество дней в месяце (например, 30 для июня)
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    // 1. Отрисовка пустых ячеек сдвига начала недели
    for (let i = 0; i < shiftedIndex; i++) {
        const blank = document.createElement('div');
        blank.className = 'calendar-day-cell empty-cell';
        container.appendChild(blank);
    }

    // 2. Генерация ровно стольких ячеек, сколько дней в месяце (30 ячеек для июня)
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        
        const dayStr = String(day).padStart(2, '0');
        const fullDateStr = `${pickerVal}-${dayStr}`;
        
        // Клик по ячейке открывает модальное окно дня
        cell.onclick = () => openDayModal(fullDateStr);

        const todayStr = new Date().toISOString().split('T')[0];
        if(fullDateStr === todayStr) cell.classList.add('current-day');

        cell.innerHTML = `<span class="cell-day-number">${day}</span>`;

        // Фильтруем и выводим мини-плашки встреч внутри ячейки
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

function openDayModal(dateStr) {
    currentSelectedDateStr = dateStr;
    document.getElementById('day-modal').classList.remove('hidden');
    document.getElementById('modal-day-title').innerText = `Расписание на ${dateStr}`;

    if(currentRole === 'speaker' || currentRole === 'admin') {
        document.getElementById('floating-add-btn').classList.remove('hidden');
    } else {
        document.getElementById('floating-add-btn').classList.add('hidden');
    }

    renderDayEventsDetails();
}

function closeDayModal(e) {
    if(!e || e.target.classList.contains('modal-overlay')) {
        document.getElementById('day-modal').classList.add('hidden');
    }
}

function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    listContainer.innerHTML = '';

    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);
    dayEvents.sort((a,b) => a.event_time.localeCompare(b.event_time));

    const timeSlots = document.querySelectorAll('.time-slot');
    timeSlots.forEach(slot => {
        slot.classList.remove('has-event');
        const hour = slot.getAttribute('data-hour');
        
        if (currentRole === 'speaker' || currentRole === 'admin') {
            slot.onclick = () => triggerCreateEvent(hour);
        } else {
            slot.onclick = null;
        }
    });

    if(dayEvents.length === 0) {
        listContainer.innerHTML = `<p style="padding:20px; text-align:center; color: var(--text-muted);">Встреч на этот день не запланировано.</p>`;
        return;
    }

    dayEvents.forEach(e => {
        const eventHour = e.event_time.split(':')[0] + ':00';
        const matchingSlot = document.querySelector(`.time-slot[data-hour="${eventHour}"]`);
        if (matchingSlot) matchingSlot.classList.add('has-event');

        const rsvp = cachedRsvps.find(r => r.event_id === e.id);
        
        let statusText = 'Подтвердите участие';
        let statusClass = 'status-pending';
        let buttonsHtml = '';

        if (!rsvp) {
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
        
        let cardBody = `
            <div class="event-info-clickable">
                <h4>${e.title}</h4>
                <p class="event-meta-text">🕒 Время начала: <strong>${e.event_time}</strong></p>
                <p class="event-meta-text">📍 Адрес проведения: <strong>${e.address}</strong></p>
                <span class="event-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;

        card.innerHTML = cardBody + (currentRole === 'resident' ? buttonsHtml : '');

        if (currentRole === 'speaker' || currentRole === 'admin') {
            card.style.cursor = 'pointer';
            card.querySelector('.event-info-clickable').onclick = () => {
                triggerEditEvent(e.id, e.title, e.event_time, e.address);
            };
        }

        listContainer.appendChild(card);
    });
}

function openConfirmDialogue(eventId, decision) {
    const modal = document.getElementById('club-confirm-modal');
    const text = document.getElementById('confirm-modal-text');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const noBtn = document.getElementById('confirm-no-btn');

    if (decision === 'going') {
        text.innerText = "Подтверждаете участие?";
    } else {
        text.innerText = "Вы точно хотите отказаться от участия?";
    }

    modal.classList.remove('hidden');

    yesBtn.onclick = async () => {
        modal.classList.add('hidden');
        const res = await fetch('/api/events/rsvp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ event_id: eventId, status: decision })
        });
        
        if (res.ok) {
            await renderGoogleCalendar();
            renderDayEventsDetails();
        } else {
            const errData = await res.json();
            alert(errData.error);
        }
    };

    noBtn.onclick = () => { modal.classList.add('hidden'); };
}

function triggerCreateEvent(hourStr) {
    document.getElementById('editor-modal-title').innerText = "Настройка стратегического события";
    document.getElementById('edit-event-id').value = '';
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-time-input').value = hourStr; 
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
    document.getElementById('btn-delete-event').style.display = 'block'; 
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

    if(!title || !event_time || !address) return alert("Все поля обязательны к заполнению.");

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

function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).add ? document.getElementById(`tab-${tab}`).classList.add('active') : document.getElementById(`tab-${tab}`).className += ' active';

    if(tab === 'calendar') renderGoogleCalendar();
}
