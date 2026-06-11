let token = localStorage.getItem('token') || '';
let currentRole = ''; 
let myChart = null;
let selectedResidentId = null;
let currentSelectedDateStr = ''; 
let cachedEvents = [];
let cachedRsvps = [];
let activeModalTab = 'summary';

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
    
    document.getElementById('user-display-name').innerText = data.type === 'resident' ? 'Резидент' : 'Методолог';

    if (data.type === 'resident') {
        document.getElementById('resident-view').classList.remove('hidden');
        document.getElementById('speaker-view').classList.add('hidden');
        document.getElementById('global-add-resident-btn').classList.add('hidden');
        
        document.getElementById('res-name').innerText = data.profile.full_name || '-';
        document.getElementById('res-company').innerText = data.profile.company || '-';
        document.getElementById('res-niche').innerText = data.profile.niche || '-';
        document.getElementById('res-turnover').innerText = data.profile.turnover || '-';
        
        renderResidentFocusView(data.metrics);
        renderChart(data.metrics);
    } else {
        document.getElementById('speaker-view').classList.remove('hidden');
        document.getElementById('resident-view').classList.add('hidden');
        document.getElementById('global-add-resident-btn').classList.remove('hidden');
        
        // Исправление: Выводим Логин (Email) после ФИО резидента в реестре методолога
        const listContainer = document.getElementById('residents-list');
        listContainer.innerHTML = data.residents.map(r => `
            <div class="resident-item" onclick="openSpeakerEditor(${r.id}, '${r.full_name}')">
                <h4>${r.full_name} <span style="font-size:0.85rem; color:var(--accent-gold); font-weight:400;">(${r.email})</span></h4>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">${r.company} — ${r.niche}</p>
            </div>
        `).join('');
    }
}

function renderResidentFocusView(metrics) {
    const recBlock = document.getElementById('recommendations-block');
    recBlock.innerHTML = metrics.map(m => `
        <div class="log-segment-box">
            <strong>Период: ${m.date_period}</strong>
            ${m.summary_title ? `<p style="margin-top:5px; color:var(--accent-gold);">Встреча: ${m.summary_title} (${m.summary_date})</p>` : ''}
            <p style="margin-top:8px; font-size:0.9rem; color:#e0e0e0;">${m.recommendations || 'Рекомендации отсутствуют.'}</p>
        </div>
    `).join('');
}

function openAddResidentModal() { document.getElementById('add-resident-modal').classList.remove('hidden'); }
function closeAddResidentModal() { document.getElementById('add-resident-modal').classList.add('hidden'); }

async function submitNewResident() {
    const payload = {
        fullName: document.getElementById('add-res-name').value,
        email: document.getElementById('add-res-email').value, // Передаем кастомный email из формы
        company: document.getElementById('add-res-company').value,
        niche: document.getElementById('add-res-niche').value,
        turnover: document.getElementById('add-res-turnover').value,
        entryRequest: document.getElementById('add-res-request').value
    };
    if(!payload.email) { alert("Пожалуйста, заполните поле Email"); return; }

    const res = await fetch('/api/residents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        alert(`Резидент успешно добавлен! Доступ открыт для: ${payload.email}`);
        closeAddResidentModal();
        loadDashboardData();
    }
}

function openSessionResultsModal() { 
    document.getElementById('session-results-modal').classList.remove('hidden'); 
    switchModalTab('summary'); 
}
function closeSessionResultsModal() { document.getElementById('session-results-modal').classList.add('hidden'); }

function switchModalTab(tab) {
    activeModalTab = tab;
    document.getElementById('modal-tab-summary').classList.remove('active');
    document.getElementById('modal-tab-recommendations').classList.remove('active');
    document.getElementById('modal-body-summary').classList.add('hidden');
    document.getElementById('modal-body-recommendations').classList.add('hidden');
    
    document.getElementById(`modal-tab-${tab}`).classList.add('active');
    document.getElementById(`modal-body-${tab}`).classList.remove('hidden');
}

async function submitSessionResults() {
    const payload = {
        resident_id: selectedResidentId,
        date_period: document.getElementById('edit-period').value,
        summary_title: document.getElementById('log-summary-title').value,
        summary_date: document.getElementById('log-summary-date').value,
        summary_topic: document.getElementById('log-summary-topic').value,
        summary_content: document.getElementById('log-summary-content').value,
        summary_requests: document.getElementById('log-summary-requests').value,
        recs_title: document.getElementById('log-recs-title').value,
        recs_desc: document.getElementById('log-recs-desc').value
    };
    
    const res = await fetch('/api/metrics/extended-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    if(res.ok) {
        alert('Данные сохранены.');
        closeSessionResultsModal();
        openSpeakerEditor(selectedResidentId, "");
    }
}

// Изменение порядка: Сначала группируются ВСЕ "Итоги встреч", а затем ВСЕ "Комментарии и рекомендации"
async function openSpeakerEditor(residentId, name) {
    selectedResidentId = residentId;
    document.getElementById('editor-block').classList.remove('hidden');
    if(name) document.getElementById('edit-resident-title').innerText = `Управление резидентом: ${name}`;
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    
    const logsContainer = document.getElementById('extended-view-logs');
    logsContainer.innerHTML = `<h4>Первоначальный входной запрос:</h4><p style="color:var(--text-muted); margin-bottom:20px; font-size:0.95rem;">${data.profile.entry_request || 'Не указан'}</p>`;
    
    if(data.metrics.length === 0) {
        logsContainer.innerHTML += `<p style="color:var(--text-muted); font-size:0.9rem;">Логи по встречам и рекомендациям пока отсутствуют.</p>`;
        return;
    }

    let summaryHtml = "";
    let recommendationsHtml = "";

    data.metrics.forEach(m => {
        if(m.summary_title) {
            summaryHtml += `
                <div class="log-segment-box">
                    <h5>📋 ${m.summary_title}</h5>
                    <p class="sub-meta-p">Дата проведения: ${m.summary_date} | Период: ${m.date_period}</p>
                    <p class="text-content-p"><strong>Тема:</strong> ${m.summary_topic || '-'}</p>
                    <p class="text-content-p"><strong>Содержание:</strong> ${m.summary_content || '-'}</p>
                    <p class="text-content-p"><strong>Запросы:</strong> ${m.summary_requests || '-'}</p>
                </div>
            `;
        }
        if(m.recs_title) {
            recommendationsHtml += `
                <div class="log-segment-box" style="border-left: 3px solid var(--accent-gold);">
                    <h5>🎯 Комментарии и рекомендации: ${m.recs_title}</h5>
                    <p class="sub-meta-p">Отчетный период: ${m.date_period}</p>
                    <p class="text-content-p">${m.recs_desc || '-'}</p>
                </div>
            `;
        }
    });

    logsContainer.innerHTML += summaryHtml + recommendationsHtml;
}

async function renderGoogleCalendar() {
    const pickerVal = document.getElementById('calendarMonthPicker').value;
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

    let firstDayIndex = new Date(year, month - 1, 1).getDay();
    let shiftedIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    for (let i = 0; i < shiftedIndex; i++) {
        container.appendChild(Object.assign(document.createElement('div'), { className: 'calendar-day-cell empty-cell' }));
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        const dayStr = String(day).padStart(2, '0');
        const fullDateStr = `${pickerVal}-${dayStr}`;
        
        cell.onclick = (e) => {
            if(!e.target.classList.contains('counter-badge-clickable')) {
                if(window.innerWidth <= 768) {
                    selectMobileTimelineDate(fullDateStr);
                } else {
                    openDayModal(fullDateStr);
                }
            }
        };

        cell.innerHTML = `<span class="cell-day-number">${day}</span>`;
        const dayEvents = cachedEvents.filter(e => e.event_date === fullDateStr);
        
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'mobile-dots-indicator-container';

        dayEvents.forEach(e => {
            const badge = document.createElement('div');
            badge.className = 'micro-event-badge';
            badge.innerText = `${e.event_time} ${e.title}`;
            cell.appendChild(badge);

            const dot = document.createElement('div');
            dot.className = 'mobile-event-dot';
            dotsContainer.appendChild(dot);

            if (currentRole === 'speaker' || currentRole === 'admin') {
                const countLink = document.createElement('span');
                countLink.className = 'counter-badge-clickable';
                countLink.innerText = `Записано: ${e.going_count}`;
                countLink.onclick = (event) => {
                    event.stopPropagation();
                    showAttendeesModal(e.attendees);
                };
                cell.appendChild(countLink);
            }
        });

        cell.appendChild(dotsContainer);
        container.appendChild(cell);
    }

    if(window.innerWidth <= 768) {
        const todayStr = `${pickerVal}-11`; 
        selectMobileTimelineDate(todayStr);
    }
}

// Восстановление RSVP для резидентов и создания встреч для методолога в мобильной ленте
function selectMobileTimelineDate(dateStr) {
    currentSelectedDateStr = dateStr;
    const parts = dateStr.split('-');
    document.getElementById('mobile-timeline-date-title').innerText = `События: ${parts[2]}.${parts[1]}.${parts[0]}`;
    
    const timelineList = document.getElementById('mobile-timeline-events-list');
    timelineList.innerHTML = '';
    
    // Кнопка создания встречи для методолога
    if (currentRole === 'speaker' || currentRole === 'admin') {
        const createBtn = document.createElement('button');
        createBtn.className = "btn-primary";
        createBtn.style.cssText = "width:100%; margin-bottom:15px; font-size:0.85rem; padding:8px;";
        createBtn.innerText = "+ Создать встречу на этот день";
        createBtn.onclick = () => triggerCreateEvent("12:00");
        timelineList.appendChild(createBtn);
    }

    const dayEvents = cachedEvents.filter(e => e.event_date === dateStr);
    if(dayEvents.length === 0) {
        timelineList.innerHTML += '<div class="timeline-empty">Событий не запланировано</div>';
        return;
    }

    dayEvents.forEach(e => {
        const item = document.createElement('div');
        item.style.cssText = "padding: 14px 0; border-bottom: 1px solid #222;";
        item.innerHTML = `
            <div style="font-weight:600; color:var(--accent-gold); font-size:0.95rem;">${e.event_time} — ${e.title}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">📍 ${e.address}</div>
        `;

        if (currentRole === 'speaker' || currentRole === 'admin') {
            const mBtn = document.createElement('div');
            mBtn.style.cssText = "font-size:0.75rem; color:var(--accent-gold); text-decoration:underline; margin-top:7px; cursor:pointer;";
            mBtn.innerText = `Редактировать событие / Участники (${e.going_count} чел.)`;
            mBtn.onclick = () => triggerEditEvent(e.id, e.title, e.event_time, e.address);
            item.appendChild(mBtn);
        } else if (currentRole === 'resident') {
            // Восстановление функционала RSVP на мобильных устройствах для резидента
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            const statusText = userRsvp ? (userRsvp.status === 'going' ? 'Вы подтвердили участие' : 'Вы отказались') : 'Участие не подтверждено';
            
            const rsvpContainer = document.createElement('div');
            rsvpContainer.style.cssText = "margin-top:10px; display:flex; flex-direction:column; gap:5px;";
            rsvpContainer.innerHTML = `
                <div style="font-size:0.8rem; color:var(--accent-gold); margin-bottom:4px;">${statusText}</div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-confirm-action" style="padding:6px 12px; font-size:0.8rem;" onclick="submitRsvp(${e.id}, 'going')">Точно буду</button>
                    <button class="btn-cancel-action" style="padding:6px 12px; font-size:0.8rem;" onclick="submitRsvp(${e.id}, 'declined')">Не смогу</button>
                </div>
            `;
            item.appendChild(rsvpContainer);
        }
        timelineList.appendChild(item);
    });
}

function openDayModal(dateStr) {
    currentSelectedDateStr = dateStr;
    document.getElementById('day-modal').classList.remove('hidden');
    document.getElementById('modal-day-title').innerText = `События на ${dateStr}`;
    renderDayEventsDetails();
}

function closeDayModal(e) { 
    if(!e || e.target.classList.contains('modal-overlay')) document.getElementById('day-modal').classList.add('hidden'); 
}

// Восстановление RSVP для резидентов и создание для методолога в десктопной модалке
function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    listContainer.innerHTML = '';
    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);

    if (dayEvents.length === 0) {
        listContainer.innerHTML = `<p style="padding:20px; text-align:center; color: var(--text-muted);">Событий на этот день не запланировано.</p>`;
        return;
    }

    dayEvents.forEach(e => {
        const card = document.createElement('div');
        card.className = 'detailed-event-card';
        card.style.position = 'relative';
        card.style.marginBottom = '15px';
        
        let actionButtonsHtml = '';

        if (currentRole === 'speaker' || currentRole === 'admin') {
            // Кнопка редактирования для методолога
            actionButtonsHtml = `
                <button class="btn-primary" style="padding:4px 10px; font-size:0.8rem; margin-top:10px;" 
                    onclick="event.stopPropagation(); triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}')">
                    Редактировать / Удалить
                </button>
            `;
        } else if (currentRole === 'resident') {
            // Проверяем текущий статус RSVP резидента
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            
            if (userRsvp) {
                if (userRsvp.status === 'going') {
                    actionButtonsHtml = `<div style="color:var(--status-green); font-weight:600; margin-top:10px;">Вы записаны</div>`;
                } else if (userRsvp.status === 'declined') {
                    actionButtonsHtml = `<div style="color:var(--status-red); font-weight:600; margin-top:10px;">Вы отказались от участия</div>`;
                }
            } else {
                // Если выбора еще нет — показываем текст "Подтвердите участие" и новые кнопки
                actionButtonsHtml = `
                    <div style="font-size:0.85rem; color:var(--accent-gold); margin-top:10px; margin-bottom:6px;">Статус: Подтвердите участие</div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-confirm-action" style="padding:6px 14px; font-size:0.8rem;" onclick="handleResidentDecision(${e.id}, 'going')">Я буду</button>
                        <button class="btn-cancel-action" style="padding:6px 14px; font-size:0.8rem;" onclick="handleResidentDecision(${e.id}, 'declined')">Не в этот раз</button>
                    </div>
                `;
            }
        }

        // Счетчик участников внизу для администратора
        let adminCounterHtml = '';
if (currentRole === 'speaker' || currentRole === 'admin') {
    // Безопасно сохраняем индекс события вместо передачи сырого JSON в onclick
    adminCounterHtml = `
        <div style="margin-top:12px; border-top:1px solid #222; padding-top:8px; font-size:0.85rem;">
            <span style="color:var(--accent-gold); cursor:pointer; text-decoration:underline;" 
                  onclick="event.stopPropagation(); window.currentDetailedEventId = ${e.id}; openAttendeesModalFromCache();">
                Участники (Подтвердили/Отклонили): ${e.going_count || 0} чел.
            </span>
        </div>
    `;
}

        // Добавить прямо под функцией renderDayEventsDetails
function openAttendeesModalFromCache() {
    const foundEvent = cachedEvents.find(e => e.id === window.currentDetailedEventId);
    if (foundEvent && typeof showAttendeesModal === 'function') {
        showAttendeesModal(foundEvent.attendees || []);
    }
}

        card.innerHTML = `
            <h4>${e.title}</h4>
            <p class="event-meta-text" style="margin-top:5px;">🕒 Время: <strong>${e.event_time}</strong></p>
            <p class="event-meta-text">📍 Адрес: <strong>${e.address}</strong></p>
            ${actionButtonsHtml}
            ${adminCounterHtml}
        `;
        
        listContainer.appendChild(card);
    });
}

// Обработчик нажатия кнопок с окнами подтверждения "Да/Отмена"
function handleResidentDecision(eventId, status) {
    let question = status === 'going' ? "Подтверждаете участие?" : "Вы точно хотите отказаться от участия?";
    
    if (confirm(question)) {
        // Если пользователь нажал "Да" — отправляем на бэкенд и блокируем изменение
        submitRsvp(eventId, status);
    }
    // Если нажал "Отмена" — окно просто закроется, ничего не произойдет
}

async function submitRsvp(eventId, status) {
    const res = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId, status })
    });
    if(res.ok) {
        alert('Ваш ответ сохранен!');
        await renderGoogleCalendar();
        if(window.innerWidth > 768) renderDayEventsDetails();
        else selectMobileTimelineDate(currentSelectedDateStr);
    }
}

function triggerCreateEvent(hourStr) {
    document.getElementById('editor-modal-title').innerText = "Создать событие";
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

function closeEditorModal() { document.getElementById('event-editor-modal').classList.add('hidden'); }

async function saveEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('event-title-input').value;
    const event_time = document.getElementById('event-time-input').value;
    const address = document.getElementById('event-address-input').value;

    let url = '/api/events/create', method = 'POST';
    let body = { title, event_date: currentSelectedDateStr, event_time, address };
    if(id) { url = `/api/events/${id}`; method = 'PUT'; body = { title, event_time, address }; }

    const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    if(res.ok) { 
        closeEditorModal(); 
        await renderGoogleCalendar(); 
        if(window.innerWidth > 768) renderDayEventsDetails(); 
        else selectMobileTimelineDate(currentSelectedDateStr);
    }
}

async function deleteEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    if(!id) return;
    const res = await fetch(`/api/events/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if(res.ok) { 
        closeEditorModal(); 
        await renderGoogleCalendar(); 
        if(window.innerWidth > 768) renderDayEventsDetails(); 
        else selectMobileTimelineDate(currentSelectedDateStr);
    }
}

function showAttendeesModal(attendees) {
    const modal = document.getElementById('attendees-list-modal');
    const container = document.getElementById('attendees-rows-container');
    container.innerHTML = '';
    
    if(!attendees || attendees.length === 0) {
        container.innerHTML = '<p style="color:#82807b; text-align:center;">Ни один участник ещё не сделал выбор.</p>';
    } else {
        attendees.forEach(a => {
            container.innerHTML += `
                <div class="attendee-row">
                    <span>${a.fullName}</span>
                    <span class="badge-status-sub" style="color:${a.status === 'going' ? 'var(--status-green)' : 'var(--status-red)'}">
                        ${a.status === 'going' ? 'Точно будет' : 'Отказался'}
                    </span>
                </div>
            `;
        });
    }
    modal.classList.remove('hidden');
}

function renderChart(metrics) {
    const canvas = document.getElementById('metricsChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: metrics.map(m => m.date_period),
            datasets: [
                { label: 'Бизнес', data: metrics.map(m => m.business_score), borderColor: '#b59473', tension: 0.2 },
                { label: 'Команда', data: metrics.map(m => m.team_score), borderColor: '#ffffff', tension: 0.2 },
                { label: 'Здоровье', data: metrics.map(m => m.health_score), borderColor: '#ff4444', tension: 0.2 },
                { label: 'Отношения', data: metrics.map(m => m.relations_score), borderColor: '#2ecc71', tension: 0.2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#82807b' } } } }
    });
}

function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Управление отображением плавающих кнопок методолога
    if (currentRole === 'speaker' || currentRole === 'admin') {
        if (tab === 'dashboard') {
            document.getElementById('global-add-resident-btn').classList.remove('hidden');
            document.getElementById('calendar-add-event-btn').classList.add('hidden');
        } else {
            document.getElementById('global-add-resident-btn').classList.add('hidden');
            document.getElementById('calendar-add-event-btn').classList.remove('hidden');
        }
    } else {
        document.getElementById('global-add-resident-btn').classList.add('hidden');
        document.getElementById('calendar-add-event-btn').classList.add('hidden');
    }

    if (tab === 'calendar') {
        renderGoogleCalendar();
        setupNotificationCheck(); // Включаем таймер проверки уведомлений
    }
}

// Запрос прав на системные уведомления при входе в календарь
function setupNotificationCheck() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    // Запуск проверки каждые 60 секунд
    if (!window.notificationIntervalId) {
        window.notificationIntervalId = setInterval(checkUpcomingEventsAndNotify, 60000);
        checkUpcomingEventsAndNotify(); // И разово при запуске
    }
}

function checkUpcomingEventsAndNotify() {
    if (currentRole !== 'resident' || !cachedEvents.length) return;

    const now = new Date();
    
    cachedEvents.forEach(e => {
        // Проверяем, идет ли резидент на встречу
        const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
        if (!userRsvp || userRsvp.status !== 'going') return;

        // Парсим дату и время события (например: "2026-06-24" и "14:00")
        const [year, month, day] = e.event_date.split('-').map(Number);
        const [hours, minutes] = e.event_time.split(':').map(Number);
        const eventDateTime = new Date(year, month - 1, day, hours, minutes);

        const timeDiffMs = eventDateTime - now;
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

        // Создаем уникальные ключи для localStorage, чтобы не спамить каждую минуту
        const storageKey24h = `notified_24h_${e.id}`;
        const storageKey2h = `notified_2h_${e.id}`;

        // 1. Проверка за 1 день (от 23 до 24 часов до мероприятия)
        if (timeDiffHours > 23 && timeDiffHours <= 24 && !localStorage.getItem(storageKey24h)) {
            sendBrowserNotification(`Напоминание за день`, `Завтра в ${e.event_time} состоится мероприятие: "${e.title}". Ждем вас!`);
            localStorage.setItem(storageKey24h, 'true');
        }

        // 2. Проверка за 2 часа (от 1.9 до 2 часов до мероприятия)
        if (timeDiffHours > 1.9 && timeDiffHours <= 2 && !localStorage.getItem(storageKey2h)) {
            sendBrowserNotification(`Напоминание за 2 часа`, `Сегодня в ${e.event_time} начнётся: "${e.title}". Не опаздывайте!`);
            localStorage.setItem(storageKey2h, 'true');
        }
    });
}

function sendBrowserNotification(title, text) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: text, icon: '/favicon.svg' });
    } else {
        // Запасной вариант, если уведомления запрещены в браузере
        alert(`🔔 ${title}\n\n${text}`);
    }
}
