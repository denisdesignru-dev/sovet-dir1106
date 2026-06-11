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
        
        const listContainer = document.getElementById('residents-list');
        listContainer.innerHTML = data.residents.map(r => `
            <div class="resident-item" onclick="openSpeakerEditor(${r.id}, '${r.full_name}')">
                <h4>${r.full_name}</h4>
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
        company: document.getElementById('add-res-company').value,
        niche: document.getElementById('add-res-niche').value,
        turnover: document.getElementById('add-res-turnover').value,
        entryRequest: document.getElementById('add-res-request').value
    };
    const res = await fetch('/api/residents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        const data = await res.json();
        alert(`Резидент успешно добавлен! Сгенерированный логин: ${data.email}`);
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

// Изменено: Методолог теперь видит ВСЕ блоки («Итоги встречи» + «Комментарии и рекомендации»)
async function openSpeakerEditor(residentId, name) {
    selectedResidentId = residentId;
    document.getElementById('editor-block').classList.remove('hidden');
    if(name) document.getElementById('edit-resident-title').innerText = `Управление резидентом: ${name}`;
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    
    const logsContainer = document.getElementById('extended-view-logs');
    logsContainer.innerHTML = `<h4>Первоначальный входной запрос:</h4><p style="color:var(--text-muted); margin-bottom:20px; font-size:0.95rem;">${data.profile.entry_request || 'Не указан'}</p>`;
    
    if(data.metrics.length === 0 || !data.metrics.some(m => m.summary_title || m.recs_title)) {
        logsContainer.innerHTML += `<p style="color:var(--text-muted); font-size:0.9rem;">Логи по встречам и рекомендациям пока отсутствуют.</p>`;
        return;
    }

    data.metrics.forEach(m => {
        // Блок 1: Итоги встречи (если заполнены)
        if(m.summary_title) {
            logsContainer.innerHTML += `
                <div class="log-segment-box">
                    <h5>📋 ${m.summary_title}</h5>
                    <p class="sub-meta-p">Дата проведения: ${m.summary_date} | Период: ${m.date_period}</p>
                    <p class="text-content-p"><strong>Тема:</strong> ${m.summary_topic || '-'}</p>
                    <p class="text-content-p"><strong>Содержание:</strong> ${m.summary_content || '-'}</p>
                    <p class="text-content-p"><strong>Запросы:</strong> ${m.summary_requests || '-'}</p>
                </div>
            `;
        }
        // Блок 2: Комментарии и рекомендации (если заполнены)
        if(m.recs_title) {
            logsContainer.innerHTML += `
                <div class="log-segment-box" style="border-left: 3px solid var(--accent-gold);">
                    <h5>🎯 Комментарии и рекомендации: ${m.recs_title}</h5>
                    <p class="sub-meta-p">Отчетный период: ${m.date_period}</p>
                    <p class="text-content-p">${m.recs_desc || '-'}</p>
                </div>
            `;
        }
    });
}

// Календарь с Google Calendar логикой для узких дисплеев
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
        
        // Клик по ячейке: на десктопе открывает модалку, на мобильном переключает нижнюю ленту
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
        
        // Контейнер точек для адаптива
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'mobile-dots-indicator-container';

        dayEvents.forEach(e => {
            // Десктопное представление (плитка)
            const badge = document.createElement('div');
            badge.className = 'micro-event-badge';
            badge.innerText = `${e.event_time} ${e.title}`;
            cell.appendChild(badge);

            // Добавляем точку для мобильного вида
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

    // Инициализируем мобильную хронологию на текущую или первую дату месяца
    if(window.innerWidth <= 768) {
        const todayStr = `${pickerVal}-11`; // По умолчанию 11 число отчетного месяца
        selectMobileTimelineDate(todayStr);
    }
}

// Google Calendar мобильная лента хроники
function selectMobileTimelineDate(dateStr) {
    currentSelectedDateStr = dateStr;
    const parts = dateStr.split('-');
    document.getElementById('mobile-timeline-date-title').innerText = `События: ${parts[2]}.${parts[1]}.${parts[0]}`;
    
    const timelineList = document.getElementById('mobile-timeline-events-list');
    timelineList.innerHTML = '';
    
    const dayEvents = cachedEvents.filter(e => e.event_date === dateStr);
    if(dayEvents.length === 0) {
        timelineList.innerHTML = '<div class="timeline-empty">Событий не запланировано</div>';
        return;
    }

    dayEvents.forEach(e => {
        const item = document.createElement('div');
        item.style.cssText = "padding: 12px 0; border-bottom: 1px solid #222;";
        item.innerHTML = `
            <div style="font-weight:600; color:var(--accent-gold); font-size:0.95rem;">${e.event_time} — ${e.title}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">📍 ${e.address}</div>
        `;
        if (currentRole === 'speaker' || currentRole === 'admin') {
            const mBtn = document.createElement('div');
            mBtn.style.cssText = "font-size:0.75rem; color:var(--accent-gold); text-decoration:underline; margin-top:5px; cursor:pointer;";
            mBtn.innerText = `Редактировать событие / Участники (${e.going_count} чел.)`;
            mBtn.onclick = () => triggerEditEvent(e.id, e.title, e.event_time, e.address);
            item.appendChild(mBtn);
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

function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    listContainer.innerHTML = '';
    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);

    const timeSlots = document.querySelectorAll('.time-slot');
    timeSlots.forEach(slot => {
        slot.classList.remove('has-event');
        if (currentRole === 'speaker' || currentRole === 'admin') {
            slot.onclick = () => triggerCreateEvent(slot.getAttribute('data-hour'));
        }
    });

    if(dayEvents.length === 0) {
        listContainer.innerHTML = `<p style="padding:20px; text-align:center; color: var(--text-muted);">Событий на этот день не запланировано.</p>`;
        return;
    }

    dayEvents.forEach(e => {
        const hour = e.event_time.split(':')[0] + ':00';
        const slot = document.querySelector(`.time-slot[data-hour="${hour}"]`);
        if (slot) slot.classList.add('has-event');

        const card = document.createElement('div');
        card.className = 'detailed-event-card';
        card.innerHTML = `
            <h4>${e.title}</h4>
            <p class="event-meta-text">🕒 Время: <strong>${e.event_time}</strong></p>
            <p class="event-meta-text">📍 Локация: <strong>${e.address}</strong></p>
        `;
        
        if (currentRole === 'speaker' || currentRole === 'admin') {
            card.style.cursor = 'pointer';
            card.onclick = () => triggerEditEvent(e.id, e.title, e.event_time, e.address);
        }
        listContainer.appendChild(card);
    });
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

    if(currentRole === 'speaker') {
        if(tab === 'dashboard') document.getElementById('global-add-resident-btn').classList.remove('hidden');
        else document.getElementById('global-add-resident-btn').classList.add('hidden');
    }
    if(tab === 'calendar') renderGoogleCalendar();
}
