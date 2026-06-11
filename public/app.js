let token = localStorage.getItem('token') || '';
let currentRole = ''; 
let myChart = null;
let selectedResidentId = null; // Храним ID текущего редактируемого резидента
let currentSelectedDateStr = ''; 
let cachedEvents = [];
let cachedRsvps = [];
let activeModalTab = 'summary';
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
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.remove('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.add('hidden');

            renderSpeakerRegistry(data.residents || []);
            toggleGlobalAddButton(true);
        } else {
            currentRole = 'resident';
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.add('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.remove('hidden');

            renderResidentProfile(data.profile || {});
            renderResidentMetrics(data.metrics || []);
            toggleGlobalAddButton(false);
        }
    } catch (err) {
        console.error('Ошибка загрузки данных панели:', err);
    }
}

// Отображение кнопки добавления резидентов только методологу
function toggleGlobalAddButton(show) {
    const addBtn = document.getElementById('global-add-resident-btn');
    if (addBtn) {
        addBtn.style.display = show ? 'block' : 'none';
    }
}

function renderSpeakerRegistry(residents) {
    const listContainer = document.getElementById('residents-list');
    if (!listContainer) return;
    if (!residents || residents.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-muted); padding:15px;">Резиденты не найдены</p>';
        return;
    }
    listContainer.innerHTML = residents.map(r => `
        <div class="resident-card" onclick="openSpeakerEditor(${r.id}, '${r.full_name}')" style="padding:15px; border-bottom:1px solid #222; cursor:pointer; background: #0a0a0a; border-radius: 4px; margin-bottom: 5px;">
            <div style="font-weight:600; color:var(--accent-gold);">${r.full_name}</div>
            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                ${r.company || '-'} | ${r.niche || '-'} | ${r.turnover || '-'}
            </div>
        </div>
    `).join('');
}

// Открытие информации о резиденте с функционалом СВЕРТЫВАНИЯ при повторном клике
async function openSpeakerEditor(residentId, name) {
    const editorBlock = document.getElementById('editor-block');
    if (!editorBlock) return;

    // Если этот резидент уже открыт — скрываем панель (сворачиваем обратно)
    if (selectedResidentId === residentId && !editorBlock.classList.contains('hidden')) {
        editorBlock.classList.add('hidden');
        selectedResidentId = null;
        return;
    }

    selectedResidentId = residentId;
    editorBlock.classList.remove('hidden');

    if(name && document.getElementById('edit-resident-title')) {
        document.getElementById('edit-resident-title').innerText = `Управление резидентом: ${name}`;
    }
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    
    const logsContainer = document.getElementById('extended-view-logs');
    if (!logsContainer) return;
    
    logsContainer.innerHTML = `<h4>Первоначальный входной запрос:</h4><p style="color:var(--text-muted); margin-bottom:20px; font-size:0.95rem;">${data.profile.entry_request || 'Не указан'}</p>`;
    
    if(!data.metrics || data.metrics.length === 0) {
        logsContainer.innerHTML += `<p style="color:var(--text-muted); font-size:0.9rem;">Логи и директивы отсутствуют.</p>`;
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

function renderResidentProfile(profile) {
    if (document.getElementById('res-name')) document.getElementById('res-name').innerText = profile.full_name || '-';
    if (document.getElementById('res-company')) document.getElementById('res-company').innerText = profile.company || '-';
    if (document.getElementById('res-niche')) document.getElementById('res-niche').innerText = profile.niche || '-';
    if (document.getElementById('res-turnover')) document.getElementById('res-turnover').innerText = profile.turnover || '-';
}

function renderResidentMetrics(metrics) {
    renderResidentFocusView(metrics);
    const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
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
    const emailVal = document.getElementById('add-res-email').value;
    // Проверяем наличие инпута пароля в вашей HTML разметке, если нет — ставим дефолт '123456'
    const passwordInput = document.getElementById('add-res-password'); 
    const passwordVal = passwordInput ? passwordInput.value : '123456';

    const payload = {
        fullName: document.getElementById('add-res-name').value,
        email: emailVal,
        password: passwordVal,
        company: document.getElementById('add-res-company').value,
        niche: document.getElementById('add-res-niche').value,
        turnover: document.getElementById('add-res-turnover').value,
        entryRequest: document.getElementById('add-res-request').value
    };
    if(!payload.email) { alert("Заполните поле Email резидента"); return; }

    const res = await fetch('/api/residents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    
    if (res.ok) {
        alert(`Резидент успешно создан!\nЛогин: ${emailVal}\nПароль: ${passwordVal}`);
        closeAddResidentModal();
        loadDashboardData();
    } else {
        const data = await res.json();
        alert("Ошибка: " + (data.error || "Не удалось создать резидента"));
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
        closeSessionResultsModal();
        openSpeakerEditor(selectedResidentId, "");
    }
}

async function renderGoogleCalendar() {
    const picker = document.getElementById('calendarMonthPicker');
    if (!picker || !picker.value) return;
    const pickerVal = picker.value;
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
                    window.currentDetailedEventId = e.id;
                    openAttendeesModalFromCache();
                };
                cell.appendChild(countLink);
            }
        });

        cell.appendChild(dotsContainer);
        container.appendChild(cell);
    }

    if(window.innerWidth <= 768) {
        const todayStr = `${pickerVal}-${String(new Date().getDate()).padStart(2, '0')}`;
        selectMobileTimelineDate(todayStr);
    }
}

// Изменение разметки под мобильную версию: кнопки "Редактировать" и "Участники" разделены
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
        timelineList.innerHTML += '<div style="text-align:center; padding:20px; color:var(--text-muted);">Событий не запланировано</div>';
        return;
    }

    dayEvents.forEach(e => {
        const item = document.createElement('div');
        item.style.cssText = "padding: 14px 0; border-bottom: 1px solid #222;";
        
        let rsvpMobileContent = '';
        if (currentRole === 'speaker' || currentRole === 'admin') {
            rsvpMobileContent = `
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                    <button class="btn-primary" style="font-size:0.8rem; padding:6px; background:#1e1e1e; border:1px solid #333; width:100%; text-align:center; color: #fff;"
                         onclick="triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                        ⚙️ Редактировать событие
                    </button>
                    <button class="btn-primary" style="font-size:0.8rem; padding:6px; background:#111; border:1px solid var(--accent-gold); width:100%; text-align:center; color: var(--accent-gold);"
                         onclick="window.currentDetailedEventId = ${e.id}; openAttendeesModalFromCache();">
                        👥 Участники (${e.going_count} чел.)
                    </button>
                </div>
            `;
        } else if (currentRole === 'resident') {
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            if (userRsvp) {
                rsvpMobileContent = `<div style="font-size:0.85rem; font-weight:600; margin-top:8px; color:#fff;">${userRsvp.status === 'going' ? '🟢 Вы записаны' : '🔴 Вы отказались'}</div>`;
            } else {
                rsvpMobileContent = `
                    <div class="mobile-rsvp-actions" id="mobile-rsvp-${e.id}" style="margin-top:10px; display:flex; flex-direction:column; gap:5px;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn-confirm-action" style="padding:6px 12px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'going', true)">Буду</button>
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
    const dayModal = document.getElementById('day-modal');
    if (!dayModal) return;
    
    dayModal.classList.remove('hidden');
    
    const titleElem = document.getElementById('modal-day-title');
    if (titleElem) {
        // Красиво форматируем дату из YYYY-MM-DD в DD.MM.YYYY
        const parts = dateStr.split('-');
        titleElem.innerText = `События на ${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    
    // Перерисовываем содержимое (включая нашу кнопку)
    renderDayEventsDetails();
}

function closeDayModal(e) { 
    if(!e || e.target.classList.contains('modal-overlay')) {
        document.getElementById('day-modal').classList.add('hidden');
    }
}

function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);

    // ИСПРАВЛЕНИЕ: Расширяем проверку. Если роль speaker, admin ИЛИ на экране отображается speaker-view
    const isMethodologist = currentRole === 'speaker' || 
                            currentRole === 'admin' || 
                            (document.getElementById('speaker-view') && !document.getElementById('speaker-view').classList.contains('hidden'));

    if (isMethodologist) {
        const createBtnPC = document.createElement('button');
        createBtnPC.className = "btn-primary";
        createBtnPC.style.cssText = "width:100%; margin-bottom:20px; font-size:0.9rem; padding:10px; background: #b59473; color: #000; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; display: block !important;";
        createBtnPC.innerText = "➕ Добавить событие в этот день";
        createBtnPC.onclick = () => {
            triggerCreateEvent("12:00"); 
        };
        listContainer.appendChild(createBtnPC);
    }

    if (dayEvents.length === 0) {
        listContainer.innerHTML += `<p style="padding:20px; text-align:center; color: var(--text-muted); width: 100%;">Событий не запланировано.</p>`;
        return; 
    }

    dayEvents.forEach(e => {
        const card = document.createElement('div');
        card.style.cssText = "position:relative; margin-bottom:15px; background:#111; padding:15px; border-radius:4px;";
        
        let actionButtonsHtml = '';
        if (isMethodologist) {
            actionButtonsHtml = `
                <button class="btn-primary" style="padding:4px 10px; font-size:0.8rem; margin-top:10px;" 
                    onclick="triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                    Редактировать / Удалить
                </button>
            `;
        } else {
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            if (userRsvp) {
                actionButtonsHtml = `<div style="font-weight:600; margin-top:10px;">${userRsvp.status === 'going' ? 'Вы записаны' : 'Вы отказались'}</div>`;
            } else {
                actionButtonsHtml = `
                    <div id="desktop-rsvp-${e.id}" style="margin-top:10px;">
                        <div style="display:flex; gap:10px;">
                            <button class="btn-confirm-action" style="padding:6px 14px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'going', false)">Я буду</button>
                            <button class="btn-cancel-action" style="padding:6px 14px; font-size:0.8rem;" onclick="openCustomConfirmModal(${e.id}, 'declined', false)">Не смогу</button>
                        </div>
                    </div>
                `;
            }
        }

        let adminCounterHtml = '';
        if (isMethodologist) {
            adminCounterHtml = `
                <div style="margin-top:12px; border-top:1px solid #222; padding-top:8px; font-size:0.85rem;">
                    <span style="color:var(--accent-gold); cursor:pointer; text-decoration:underline;" 
                          onclick="window.currentDetailedEventId = ${e.id}; openAttendeesModalFromCache();">
                        Просмотр регистрации участников (${e.going_count || 0} чел.)
                    </span>
                </div>
            `;
        }

        card.innerHTML = `
            <h4>${e.title}</h4>
            <p style="margin-top:5px; font-size:0.85rem;">🕒 Время: <strong>${e.event_time}</strong></p>
            <p style="font-size:0.85rem;">📍 Адрес: <strong>${e.address}</strong></p>
            ${actionButtonsHtml}
            ${adminCounterHtml}
        `;
        listContainer.appendChild(card);
    });
}

function openCustomConfirmModal(eventId, status, isMobile) {
    pendingRsvpData = { eventId, status, isMobile };
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '3000'; // Всегда на самом верху
        modal.innerHTML = `
            <div class="modal-box" style="max-width:320px; text-align:center; padding:20px; background:#000; border:1px solid #222;">
                <h3 style="color:var(--accent-gold); margin-bottom:15px;">Подтверждение</h3>
                <p id="custom-confirm-text" style="font-size:0.9rem; margin-bottom:20px;"></p>
                <div style="display:flex; gap:10px; justify-content:center;">
                    <button class="btn-primary" style="padding:8px 16px;" onclick="confirmCustomDecision(true)">Да</button>
                    <button class="btn-secondary" style="padding:8px 16px; background:#222;" onclick="confirmCustomDecision(false)">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('custom-confirm-text').innerText = status === 'going' ? "Подтверждаете участие?" : "Отклонить участие?";
    modal.classList.remove('hidden');
}

function confirmCustomDecision(isConfirmed) {
    document.getElementById('custom-confirm-modal').classList.add('hidden');
    if (isConfirmed && pendingRsvpData) {
        submitRsvp(pendingRsvpData.eventId, pendingRsvpData.status, pendingRsvpData.isMobile);
    }
}

async function submitRsvp(eventId, status, isMobile) {
    const res = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId, status })
    });
    if(res.ok) {
        await renderGoogleCalendar();
        if(window.innerWidth > 768) renderDayEventsDetails();
        else selectMobileTimelineDate(currentSelectedDateStr);
    }
}

function triggerCreateEvent(hourStr) {
    const editorModal = document.getElementById('event-editor-modal');
    if (!editorModal) return;

    document.getElementById('editor-modal-title').innerText = "Создать событие";
    document.getElementById('edit-event-id').value = '';
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-time-input').value = hourStr;
    document.getElementById('event-address-input').value = '';
    document.getElementById('event-date-input').value = currentSelectedDateStr;
    document.getElementById('btn-delete-event').style.display = 'none';
    
    // Принудительно выводим окно поверх мобильного таймлайна
    editorModal.style.zIndex = '4000'; 
    editorModal.classList.remove('hidden');
}
function triggerEditEvent(id, title, time, address, dateStr) {
    document.getElementById('editor-modal-title').innerText = "Редактировать событие";
    document.getElementById('edit-event-id').value = id;
    document.getElementById('event-title-input').value = title;
    document.getElementById('event-time-input').value = time;
    document.getElementById('event-address-input').value = address;
    document.getElementById('event-date-input').value = dateStr || currentSelectedDateStr;
    document.getElementById('btn-delete-event').style.display = 'block';
    document.getElementById('event-editor-modal').classList.remove('hidden');
}

function closeEditorModal() { document.getElementById('event-editor-modal').classList.add('hidden'); }

async function saveEventFromModal() {
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('event-title-input').value;
    const event_time = document.getElementById('event-time-input').value;
    const address = document.getElementById('event-address-input').value;
    const event_date = document.getElementById('event-date-input').value || currentSelectedDateStr;

    let url = '/api/events/create', method = 'POST';
    let body = { title, event_date, event_time, address };
    if(id) { url = `/api/events/${id}`; method = 'PUT'; }

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
        container.innerHTML = '<p style="color:#82807b; text-align:center;">Записей на участие нет.</p>';
    } else {
        attendees.forEach(a => {
            container.innerHTML += `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #111;">
                    <span>${a.fullName || a.full_name || 'Резидент'}</span>
                    <span style="color:${a.status === 'going' ? 'var(--status-green)' : 'var(--status-red)'}">
                        ${a.status === 'going' ? 'Будет' : 'Отклонил'}
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
                { label: 'Бизнес', data: metrics.map(m => m.business_score || m.business), borderColor: '#b59473', tension: 0.2 },
                { label: 'Команда', data: metrics.map(m => m.team_score || m.team), borderColor: '#ffffff', tension: 0.2 },
                { label: 'Здоровье', data: metrics.map(m => m.health_score || m.health), borderColor: '#ff4444', tension: 0.2 },
                { label: 'Отношения', data: metrics.map(m => m.relations_score || m.relations), borderColor: '#2ecc71', tension: 0.2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Кнопка добавления события видна методологу на вкладке Календарь
    const addEvtBtn = document.getElementById('calendar-add-event-btn');
    if (addEvtBtn) {
        addEvtBtn.style.display = (tab === 'calendar' && (currentRole === 'speaker' || currentRole === 'admin')) ? 'block' : 'none';
    }

    if (currentRole === 'speaker' || currentRole === 'admin') {
        toggleGlobalAddButton(tab === 'dashboard');
    }

    if (tab === 'calendar') renderGoogleCalendar();
}
