let token = localStorage.getItem('token') || '';
let currentRole = ''; 
let myChart = null;
let selectedResidentId = null;
let currentSelectedDateStr = ''; 
let cachedEvents = [];
let cachedRsvps = [];
let activeModalTab = 'summary';

// Хранилище для RSVP перед отправкой
let pendingRsvpData = null;

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
    if (document.getElementById('auth-screen')) document.getElementById('auth-screen').classList.add('hidden');
    if (document.getElementById('main-screen')) document.getElementById('main-screen').classList.remove('hidden');
    loadDashboardData();
}

async function loadDashboardData() {
    try {
        const res = await fetch('/api/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        currentRole = data.type;
        
        if (document.getElementById('user-display-name')) {
            document.getElementById('user-display-name').innerText = (data.type === 'speaker' || data.type === 'admin') ? 'Методолог' : 'Резидент';
        }

        if (data.type === 'speaker' || data.type === 'admin') {
            currentRole = 'speaker';
            if (document.getElementById('role-badge')) document.getElementById('role-badge').innerText = 'Методолог (Админ)';
            
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.remove('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.add('hidden');

            renderSpeakerRegistry(data.residents || []);
            toggleGlobalAddButton(true);
        } else {
            currentRole = 'resident';
            if (document.getElementById('role-badge')) document.getElementById('role-badge').innerText = 'Резидент';

            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.add('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.remove('hidden');

            renderResidentProfile(data.profile || {});
            renderResidentMetrics(data.metrics || []);
            toggleGlobalAddButton(false);
        }
    } catch (err) {
        console.error('Ошибка загрузки дашборда:', err);
    }
}

// Принудительное отображение кнопки добавления резидентов методологу
function toggleGlobalAddButton(show) {
    const addBtns = [
        document.getElementById('global-add-resident-btn'),
        document.getElementById('add-resident-btn'),
        document.querySelector('.btn-add-resident')
    ];
    addBtns.forEach(btn => {
        if (btn) {
            if (show) btn.style.setProperty('display', 'block', 'important');
            else btn.style.setProperty('display', 'none', 'important');
        }
    });
}

function renderSpeakerRegistry(residents) {
    const listContainer = document.getElementById('residents-list');
    if (!listContainer) return;
    if (!residents || residents.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-muted); padding:15px;">Резиденты не найдены</p>';
        return;
    }
    listContainer.innerHTML = residents.map(r => `
        <div class="resident-card" onclick="openSpeakerEditor(${r.id}, '${r.full_name}')" style="padding:15px; border-bottom:1px solid #222; cursor:pointer;">
            <div style="font-weight:600; color:var(--accent-gold);">${r.full_name}</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                ${r.company || '-'} | ${r.niche || '-'} | ${r.turnover || '-'}
            </div>
        </div>
    `).join('');
}

function renderResidentProfile(profile) {
    if (document.getElementById('res-name')) document.getElementById('res-name').innerText = profile.full_name || '-';
    if (document.getElementById('res-company')) document.getElementById('res-company').innerText = profile.company || '-';
    if (document.getElementById('res-niche')) document.getElementById('res-niche').innerText = profile.niche || '-';
    if (document.getElementById('res-turnover')) document.getElementById('res-turnover').innerText = profile.turnover || '-';
}

function renderResidentMetrics(metrics) {
    renderResidentFocusView(metrics);
    
    // Автоматическая подстановка текущего месяца в селектор периода, если его нет
    const now = new Date();
    const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const currentPeriodStr = `${months[now.getMonth()]} ${now.getFullYear()}`;
    
    const periodInput = document.getElementById('edit-period');
    if (periodInput && !periodInput.value) {
        periodInput.value = currentPeriodStr;
    }

    // Сортируем месяцы хронологически для корректного отображения тренда на графике
    const sortedMetrics = [...metrics].sort((a, b) => {
        const parsePeriod = (p) => {
            if (!p) return 0;
            const parts = p.split(' ');
            const mIdx = months.indexOf(parts[0]);
            return new Date(parts[1], mIdx, 1).getTime();
        };
        return parsePeriod(a.date_period) - parsePeriod(b.date_period);
    });

    renderChart(sortedMetrics);
}

function renderResidentFocusView(metrics) {
    const recBlock = document.getElementById('recommendations-block');
    if (!recBlock) return;
    if (!metrics || metrics.length === 0) {
        recBlock.innerHTML = '<p style="color:var(--text-muted); padding:15px;">Рекомендации отсутствуют.</p>';
        return;
    }
    recBlock.innerHTML = metrics.map(m => `
        <div class="log-segment-box" style="margin-bottom:15px; padding:12px; border-left:2px solid var(--accent-gold); background:#111;">
            <strong>Период: ${m.date_period}</strong>
            ${m.summary_title ? `<p style="margin-top:5px; color:var(--accent-gold);">Встреча: ${m.summary_title} (${m.summary_date})</p>` : ''}
            <p style="margin-top:8px; font-size:0.9rem; color:#e0e0e0;">${m.recommendations || 'Рекомендации отсутствуют.'}</p>
        </div>
    `).join('');
}

function openAddResidentModal() { 
    if (document.getElementById('add-resident-modal')) document.getElementById('add-resident-modal').classList.remove('hidden'); 
}
function closeAddResidentModal() { 
    if (document.getElementById('add-resident-modal')) document.getElementById('add-resident-modal').classList.add('hidden'); 
}

async function submitNewResident() {
    const payload = {
        fullName: document.getElementById('add-res-name').value,
        email: document.getElementById('add-res-email').value,
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
    if (document.getElementById('session-results-modal')) {
        document.getElementById('session-results-modal').classList.remove('hidden'); 
        switchModalTab('summary'); 
    }
}
function closeSessionResultsModal() { 
    if (document.getElementById('session-results-modal')) document.getElementById('session-results-modal').classList.add('hidden'); 
}

function switchModalTab(tab) {
    activeModalTab = tab;
    if (document.getElementById('modal-tab-summary')) document.getElementById('modal-tab-summary').classList.remove('active');
    if (document.getElementById('modal-tab-recommendations')) document.getElementById('modal-tab-recommendations').classList.remove('active');
    if (document.getElementById('modal-body-summary')) document.getElementById('modal-body-summary').classList.add('hidden');
    if (document.getElementById('modal-body-recommendations')) document.getElementById('modal-body-recommendations').classList.add('hidden');
    
    if (document.getElementById(`modal-tab-${tab}`)) document.getElementById(`modal-tab-${tab}`).classList.add('active');
    if (document.getElementById(`modal-body-${tab}`)) document.getElementById(`modal-body-${tab}`).classList.remove('hidden');
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

async function openSpeakerEditor(residentId, name) {
    selectedResidentId = residentId;
    if (document.getElementById('editor-block')) document.getElementById('editor-block').classList.remove('hidden');
    if(name && document.getElementById('edit-resident-title')) {
        document.getElementById('edit-resident-title').innerText = `Управление резидентом: ${name}`;
    }
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    
    const logsContainer = document.getElementById('extended-view-logs');
    if (!logsContainer) return;
    
    logsContainer.innerHTML = `<h4>Первоначальный входной запрос:</h4><p style="color:var(--text-muted); margin-bottom:20px; font-size:0.95rem;">${data.profile.entry_request || 'Не указан'}</p>`;
    
    if(!data.metrics || data.metrics.length === 0) {
        logsContainer.innerHTML += `<p style="color:var(--text-muted); font-size:0.9rem;">Логи отсутствуют.</p>`;
        return;
    }

    let summaryHtml = "";
    let recommendationsHtml = "";

    data.metrics.forEach(m => {
        if(m.summary_title) {
            summaryHtml += `
                <div class="log-segment-box" style="margin-bottom:10px; background:#111; padding:10px;">
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
                <div class="log-segment-box" style="border-left: 3px solid var(--accent-gold); margin-bottom:10px; background:#111; padding:10px;">
                    <h5>🎯 Рекомендации: ${m.recs_title}</h5>
                    <p class="sub-meta-p">Отчетный период: ${m.date_period}</p>
                    <p class="text-content-p">${m.recs_desc || '-'}</p>
                </div>
            `;
        }
    });

    logsContainer.innerHTML += summaryHtml + recommendationsHtml;
}

async function renderGoogleCalendar() {
    const picker = document.getElementById('calendarMonthPicker');
    if (!picker) return;
    const pickerVal = picker.value;
    if (!pickerVal) return;
    const [year, month] = pickerVal.split('-').map(Number);
    
    const res = await fetch(`/api/events/month/${pickerVal}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    cachedEvents = data.events || [];
    cachedRsvps = data.rsvps || [];

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    if (document.getElementById('calendar-month-title')) {
        document.getElementById('calendar-month-title').innerText = `${monthNames[month - 1]} ${year}`;
    }

    const container = document.getElementById('calendar-days-container');
    if (!container) return;
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
        const currentDay = String(now.getDate()).padStart(2, '0');
        selectMobileTimelineDate(`${pickerVal}-${currentDay}`);
    }
}

function selectMobileTimelineDate(dateStr) {
    currentSelectedDateStr = dateStr;
    const parts = dateStr.split('-');
    if (document.getElementById('mobile-timeline-date-title')) {
        document.getElementById('mobile-timeline-date-title').innerText = `События: ${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    
    const timelineList = document.getElementById('mobile-timeline-events-list');
    if (!timelineList) return;
    timelineList.innerHTML = '';
    
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
        timelineList.innerHTML += '<div class="timeline-empty" style="text-align:center; padding:20px; color:var(--text-muted);">Событий не запланировано</div>';
        return;
    }

    dayEvents.forEach(e => {
        const item = document.createElement('div');
        item.style.cssText = "padding: 14px 0; border-bottom: 1px solid #222;";
        
        let rsvpMobileContent = '';
        if (currentRole === 'speaker' || currentRole === 'admin') {
            rsvpMobileContent = `
                <div style="font-size:0.75rem; color:var(--accent-gold); text-decoration:underline; margin-top:7px; cursor:pointer;" 
                     onclick="triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                    Редактировать событие / Участники (${e.going_count} чел.)
                </div>
            `;
        } else if (currentRole === 'resident') {
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            if (userRsvp) {
                const statusLabel = userRsvp.status === 'going' ? '🟢 Вы записаны' : '🔴 Вы отказались от участия';
                rsvpMobileContent = `<div style="font-size:0.85rem; font-weight:600; margin-top:8px; color:#fff;">${statusLabel}</div>`;
            } else {
                rsvpMobileContent = `
                    <div class="mobile-rsvp-actions" id="mobile-rsvp-${e.id}" style="margin-top:10px; display:flex; flex-direction:column; gap:5px;">
                        <div style="font-size:0.8rem; color:var(--accent-gold); margin-bottom:4px;">Подтвердите участие:</div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-confirm-action" style="padding:6px 12px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'going', true)">Точно буду</button>
                            <button class="btn-cancel-action" style="padding:6px 12px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'declined', true)">Не смогу</button>
                        </div>
                    </div>
                `;
            }
        }

        item.innerHTML = `
            <div style="font-weight:600; color:var(--accent-gold); font-size:0.95rem;">${e.event_time} — ${e.title}</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">📍 ${e.address}</div>
            ${rsvpMobileContent}
        `;
        timelineList.appendChild(item);
    });
}

function openDayModal(dateStr) {
    currentSelectedDateStr = dateStr;
    if (document.getElementById('day-modal')) document.getElementById('day-modal').classList.remove('hidden');
    if (document.getElementById('modal-day-title')) document.getElementById('modal-day-title').innerText = `События на ${dateStr}`;
    renderDayEventsDetails();
}

function closeDayModal(e) { 
    if(!e || e.target.classList.contains('modal-overlay')) {
        if (document.getElementById('day-modal')) document.getElementById('day-modal').classList.add('hidden');
    }
}

function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);

    if (dayEvents.length === 0) {
        listContainer.innerHTML = `<p style="padding:20px; text-align:center; color: var(--text-muted);">Событий на этот день не запланировано.</p>`;
        return;
    }

    dayEvents.forEach(e => {
        const card = document.createElement('div');
        card.className = 'detailed-event-card';
        card.style.cssText = "position:relative; margin-bottom:15px; background:#111; padding:15px; border-radius:4px;";
        
        let actionButtonsHtml = '';

        if (currentRole === 'speaker' || currentRole === 'admin') {
            actionButtonsHtml = `
                <button class="btn-primary" style="padding:4px 10px; font-size:0.8rem; margin-top:10px;" 
                    onclick="event.stopPropagation(); triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                    Редактировать / Удалить
                </button>
            `;
        } else if (currentRole === 'resident') {
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            if (userRsvp) {
                if (userRsvp.status === 'going') {
                    actionButtonsHtml = `<div style="color:var(--status-green); font-weight:600; margin-top:10px;">Вы записаны</div>`;
                } else if (userRsvp.status === 'declined') {
                    actionButtonsHtml = `<div style="color:var(--status-red); font-weight:600; margin-top:10px;">Вы отказались от участия</div>`;
                }
            } else {
                actionButtonsHtml = `
                    <div id="desktop-rsvp-${e.id}">
                        <div style="font-size:0.85rem; color:var(--accent-gold); margin-top:10px; margin-bottom:6px;">Статус: Подтвердите участие</div>
                        <div style="display:flex; gap:10px;">
                            <button class="btn-confirm-action" style="padding:6px 14px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'going', false)">Я буду</button>
                            <button class="btn-cancel-action" style="padding:6px 14px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'declined', false)">Не в этот раз</button>
                        </div>
                    </div>
                `;
            }
        }

        let adminCounterHtml = '';
        if (currentRole === 'speaker' || currentRole === 'admin') {
            adminCounterHtml = `
                <div style="margin-top:12px; border-top:1px solid #222; padding-top:8px; font-size:0.85rem;">
                    <span style="color:var(--accent-gold); cursor:pointer; text-decoration:underline;" 
                          onclick="event.stopPropagation(); window.currentDetailedEventId = ${e.id}; openAttendeesModalFromCache();">
                        Участники (Подтвердили/Отклонили): ${e.going_count || 0} чел.
                    </span>
                </div>
            `;
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

// Красивое стилизованное модальное окно вместо браузерного confirm
function openCustomConfirmModal(eventId, status, isMobile) {
    pendingRsvpData = { eventId, status, isMobile };
    
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:320px; text-align:center; padding:20px;">
                <h3 id="custom-confirm-title" style="color:var(--accent-gold); font-size:1.1rem; margin-bottom:15px;">Подтверждение</h3>
                <p id="custom-confirm-text" style="font-size:0.9rem; margin-bottom:20px; color:#e0e0e0;"></p>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button class="btn-primary" style="padding:8px 16px; font-size:0.85rem;" onclick="confirmCustomDecision(true)">Да</button>
                    <button class="btn-secondary" style="padding:8px 16px; font-size:0.85rem; background:#222;" onclick="confirmCustomDecision(false)">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const textEl = document.getElementById('custom-confirm-text');
    textEl.innerText = status === 'going' ? "Вы подтверждаете своё участие в данном событии?" : "Вы уверены, что хотите отказаться от участия?";
    modal.classList.remove('hidden');
}

function confirmCustomDecision(isConfirmed) {
    const modal = document.getElementById('custom-confirm-modal');
    if (modal) modal.classList.add('hidden');
    
    if (isConfirmed && pendingRsvpData) {
        submitRsvp(pendingRsvpData.eventId, pendingRsvpData.status, pendingRsvpData.isMobile);
    }
    pendingRsvpData = null;
}

async function submitRsvp(eventId, status, isMobile) {
    const res = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId, status })
    });
    if(res.ok) {
        // Мгновенно убираем кнопки на UI (как на ПК, так и на мобилке)
        if (isMobile) {
            const container = document.getElementById(`mobile-rsvp-${eventId}`);
            if (container) container.innerHTML = `<div style="font-size:0.85rem; font-weight:600; color:#fff; margin-top:5px;">${status === 'going' ? '🟢 Вы записаны' : '🔴 Вы отказались от участия'}</div>`;
        } else {
            const container = document.getElementById(`desktop-rsvp-${eventId}`);
            if (container) container.innerHTML = `<div style="font-size:0.85rem; font-weight:600; color:${status === 'going' ? 'var(--status-green)' : 'var(--status-red)'}; margin-top:5px;">${status === 'going' ? 'Вы записаны' : 'Вы отказались от участия'}</div>`;
        }

        // Обновляем кэш в фоне
        await renderGoogleCalendar();
    }
}

function triggerCreateEvent(hourStr) {
    if (document.getElementById('editor-modal-title')) document.getElementById('editor-modal-title').innerText = "Создать событие";
    if (document.getElementById('edit-event-id')) document.getElementById('edit-event-id').value = '';
    if (document.getElementById('event-title-input')) document.getElementById('event-title-input').value = '';
    if (document.getElementById('event-time-input')) document.getElementById('event-time-input').value = hourStr;
    if (document.getElementById('event-address-input')) document.getElementById('event-address-input').value = '';
    
    // Поле "Дата" — подставляем выбранный в календаре день
    if (document.getElementById('event-date-input')) document.getElementById('event-date-input').value = currentSelectedDateStr;
    
    if (document.getElementById('btn-delete-event')) document.getElementById('btn-delete-event').style.display = 'none';
    if (document.getElementById('event-editor-modal')) document.getElementById('event-editor-modal').classList.remove('hidden');
}

function triggerEditEvent(id, title, time, address, dateStr) {
    if (document.getElementById('editor-modal-title')) document.getElementById('editor-modal-title').innerText = "Редактировать событие";
    if (document.getElementById('edit-event-id')) document.getElementById('edit-event-id').value = id;
    if (document.getElementById('event-title-input')) document.getElementById('event-title-input').value = title;
    if (document.getElementById('event-time-input')) document.getElementById('event-time-input').value = time;
    if (document.getElementById('event-address-input')) document.getElementById('event-address-input').value = address;
    
    // Поле "Дата" для редактирования
    if (document.getElementById('event-date-input')) document.getElementById('event-date-input').value = dateStr || currentSelectedDateStr;
    
    if (document.getElementById('btn-delete-event')) document.getElementById('btn-delete-event').style.display = 'block';
    if (document.getElementById('event-editor-modal')) document.getElementById('event-editor-modal').classList.remove('hidden');
}

function closeEditorModal() { 
    if (document.getElementById('event-editor-modal')) document.getElementById('event-editor-modal').classList.add('hidden'); 
}

async function saveEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('event-title-input').value;
    const event_time = document.getElementById('event-time-input').value;
    const address = document.getElementById('event-address-input').value;
    const event_date = document.getElementById('event-date-input').value || currentSelectedDateStr;

    let url = '/api/events/create', method = 'POST';
    let body = { title, event_date, event_time, address };
    if(id) { url = `/api/events/${id}`; method = 'PUT'; body = { title, event_date, event_time, address }; }

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

function openAttendeesModalFromCache() {
    const foundEvent = cachedEvents.find(e => e.id === window.currentDetailedEventId);
    if (foundEvent) showAttendeesModal(foundEvent.attendees || []);
}

function showAttendeesModal(attendees) {
    const modal = document.getElementById('attendees-list-modal');
    const container = document.getElementById('attendees-rows-container');
    if (!modal || !container) return;
    container.innerHTML = '';
    
    if(!attendees || attendees.length === 0) {
        container.innerHTML = '<p style="color:#82807b; text-align:center;">Ни один участник ещё не сделал выбор.</p>';
    } else {
        attendees.forEach(a => {
            container.innerHTML += `
                <div class="attendee-row" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #111;">
                    <span>${a.fullName || a.full_name}</span>
                    <span style="color:${a.status === 'going' ? 'var(--status-green)' : 'var(--status-red)'}">
                        ${a.status === 'going' ? 'Точно будет' : 'Отказался'}
                    </span>
                </div>
            `;
        });
    }
    modal.classList.remove('hidden');
}

function closeAttendeesModal() {
    if (document.getElementById('attendees-list-modal')) document.getElementById('attendees-list-modal').classList.add('hidden');
}

// Аналитический радар изменений (Линейный график трендов)
function renderChart(metrics) {
    const canvas = document.getElementById('metricsChart');
    if(!canvas) return;

    // Защита: Если библиотека Chart.js еще не загрузилась на странице, подгружаем динамически
    if(typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.onload = () => renderChart(metrics);
        document.head.appendChild(script);
        return;
    }

    const ctx = canvas.getContext('2d');
    if(myChart) myChart.destroy();

    if(!metrics || metrics.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#82807b";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Данные для построения графика отсутствуют", canvas.width / 2, canvas.height / 2);
        return;
    }

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: metrics.map(m => m.date_period),
            datasets: [
                { label: 'Бизнес', data: metrics.map(m => m.business_score || m.business), borderColor: '#b59473', backgroundColor: 'transparent', tension: 0.2, borderWidth: 2 },
                { label: 'Команда', data: metrics.map(m => m.team_score || m.team), borderColor: '#ffffff', backgroundColor: 'transparent', tension: 0.2, borderWidth: 2 },
                { label: 'Здоровье', data: metrics.map(m => m.health_score || m.health), borderColor: '#ff4444', backgroundColor: 'transparent', tension: 0.2, borderWidth: 2 },
                { label: 'Отношения', data: metrics.map(m => m.relations_score || m.relations), borderColor: '#2ecc71', backgroundColor: 'transparent', tension: 0.2, borderWidth: 2 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: {
                y: { min: 1, max: 10, grid: { color: '#222' }, ticks: { color: '#82807b' } },
                x: { grid: { color: '#222' }, ticks: { color: '#82807b' } }
            },
            plugins: { legend: { labels: { color: '#82807b', font: { size: 11 } } } } 
        }
    });
}

function switchTab(tab) {
    if (document.getElementById('content-dashboard')) document.getElementById('content-dashboard').classList.add('hidden');
    if (document.getElementById('content-calendar')) document.getElementById('content-calendar').classList.add('hidden');
    if (document.getElementById('tab-dashboard')) document.getElementById('tab-dashboard').classList.remove('active');
    if (document.getElementById('tab-calendar')) document.getElementById('tab-calendar').classList.remove('active');
    
    if (document.getElementById(`content-${tab}`)) document.getElementById(`content-${tab}`).classList.remove('hidden');
    if (document.getElementById(`tab-${tab}`)) document.getElementById(`tab-${tab}`).classList.add('active');

    if (currentRole === 'speaker' || currentRole === 'admin') {
        toggleGlobalAddButton(tab === 'dashboard');
        const addEvtBtn = document.getElementById('calendar-add-event-btn');
        if (addEvtBtn) addEvtBtn.style.display = tab === 'calendar' ? 'block' : 'none';
    }

    if (tab === 'calendar') {
        renderGoogleCalendar();
        setupNotificationCheck();
    }
}

function setupNotificationCheck() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    if (!window.notificationIntervalId) {
        window.notificationIntervalId = setInterval(checkUpcomingEventsAndNotify, 60000);
        checkUpcomingEventsAndNotify();
    }
}

function checkUpcomingEventsAndNotify() {
    if (currentRole !== 'resident' || !cachedEvents.length) return;

    const now = new Date();
    cachedEvents.forEach(e => {
        const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
        if (!userRsvp || userRsvp.status !== 'going') return;

        const [year, month, day] = e.event_date.split('-').map(Number);
        const [hours, minutes] = e.event_time.split(':').map(Number);
        const eventDateTime = new Date(year, month - 1, day, hours, minutes);

        const timeDiffMs = eventDateTime - now;
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

        const storageKey24h = `notified_24h_${e.id}`;
        const storageKey2h = `notified_2h_${e.id}`;

        if (timeDiffHours > 23 && timeDiffHours <= 24 && !localStorage.getItem(storageKey24h)) {
            sendBrowserNotification(`Напоминание за день`, `Завтра в ${e.event_time} состоится: "${e.title}".`);
            localStorage.setItem(storageKey24h, 'true');
        }

        if (timeDiffHours > 1.9 && timeDiffHours <= 2 && !localStorage.getItem(storageKey2h)) {
            sendBrowserNotification(`Напоминание за 2 часа`, `Сегодня в ${e.event_time} начнётся: "${e.title}".`);
            localStorage.setItem(storageKey2h, 'true');
        }
    });
}

function sendBrowserNotification(title, text) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: text, icon: '/favicon.svg' });
    } else {
        alert(`🔔 ${title}\n\n${text}`);
    }
}
