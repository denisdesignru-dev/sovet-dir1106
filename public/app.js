// Глобальное состояние приложения
let token = localStorage.getItem('token') || '';
let currentRole = ''; // 'admin' или 'resident'
let cachedEvents = [];
let cachedRsvps = [];
let currentSelectedDateStr = ''; // Важно: хранит YYYY-MM-DD выбранного дня

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupNavigation();
});

function initAuth() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorBlock = document.getElementById('login-error');
            if (errorBlock) errorBlock.classList.add('hidden');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    if (errorBlock) {
                        errorBlock.innerText = data.error || 'Ошибка входа';
                        errorBlock.classList.remove('hidden');
                    }
                    return;
                }
                token = data.token;
                localStorage.setItem('token', token);
                showMainSpace();
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (token) {
        showMainSpace();
    } else {
        showLoginSpace();
    }
}

function showLoginSpace() {
    if (document.getElementById('auth-space')) document.getElementById('auth-space').classList.remove('hidden');
    if (document.getElementById('main-space')) document.getElementById('main-space').classList.add('hidden');
}

function showMainSpace() {
    if (document.getElementById('auth-space')) document.getElementById('auth-space').classList.add('hidden');
    if (document.getElementById('main-space')) document.getElementById('main-space').classList.remove('hidden');
    loadDashboardData();
}

function logout() {
    token = '';
    localStorage.removeItem('token');
    showLoginSpace();
}

async function loadDashboardData() {
    try {
        const res = await fetch('/api/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) { logout(); return; }
        
        const data = await res.json();
        
        // Обрабатываем роли админа/методолога
        if (data.type === 'admin' || data.type === 'speaker') {
            currentRole = 'speaker'; // оставляем 'speaker' для совместимости с HTML id="speaker-view"
            
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.add('hidden');
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.remove('hidden');
            
            // Безопасный поиск кнопки добавления участников
            const addResBtn = document.getElementById('global-add-resident-btn') || document.getElementById('btn-add-speaker-resident');
            if (addResBtn) addResBtn.classList.remove('hidden');
            
            renderRegistry(data.residents);
        } else {
            currentRole = 'resident';
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.add('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.remove('hidden');
            
            const addResBtn = document.getElementById('global-add-resident-btn') || document.getElementById('btn-add-speaker-resident');
            if (addResBtn) addResBtn.classList.add('hidden');
            
            renderResidentDashboard(data);
        }
        
        // Инициализируем календарь
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthInput = document.getElementById('calendar-month-select');
        if (monthInput && !monthInput.value) {
            monthInput.value = `${year}-${month}`;
        }
        
        await loadCalendarEvents();
    } catch (err) {
        console.error("Ошибка дашборда:", err);
    }
}

function setupNavigation() {
    const navDashboard = document.getElementById('nav-dashboard');
    const navCalendar = document.getElementById('nav-calendar');
    const pageDashboard = document.getElementById('page-dashboard');
    const pageCalendar = document.getElementById('page-calendar');

    if (navDashboard && navCalendar && pageDashboard && pageCalendar) {
        navDashboard.addEventListener('click', () => {
            navDashboard.classList.add('active');
            navCalendar.classList.remove('active');
            pageDashboard.classList.remove('hidden');
            pageCalendar.classList.add('hidden');
        });
        navCalendar.addEventListener('click', () => {
            navCalendar.classList.add('active');
            navDashboard.classList.remove('active');
            pageCalendar.classList.remove('hidden');
            pageDashboard.classList.add('hidden');
            renderGoogleCalendar();
        });
    }

    const monthSelect = document.getElementById('calendar-month-select');
    if (monthSelect) {
        monthSelect.addEventListener('change', loadCalendarEvents);
    }

    // Закрытие модального окна дня
    const closeDayModalBtn = document.getElementById('close-day-modal-btn');
    if (closeDayModalBtn) {
        closeDayModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('day-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
}

function renderRegistry(residents) {
    const listContainer = document.getElementById('residents-list');
    if (!listContainer) return;
    if (!residents || residents.length === 0) {
        listContainer.innerHTML = '<p style="padding:20px; color:var(--text-muted);">Резидентов пока нет.</p>';
        return;
    }
    listContainer.innerHTML = residents.map(r => `
        <div class="resident-card" onclick="openResidentProfile(${r.id})">
            <h4>${r.full_name}</h4>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${r.company}</p>
            <p style="font-size:0.8rem; color:#b59473; margin-top:2px;">Ниша: ${r.niche}</p>
        </div>
    `).join('');
}

function renderResidentDashboard(data) {
    if (document.getElementById('res-name')) document.getElementById('res-name').innerText = data.profile?.full_name || '-';
    if (document.getElementById('res-company')) document.getElementById('res-company').innerText = data.profile?.company || '-';
    if (document.getElementById('res-niche')) document.getElementById('res-niche').innerText = data.profile?.niche || '-';
    if (document.getElementById('res-turnover')) document.getElementById('res-turnover').innerText = data.profile?.turnover || '-';
}

// --- ЛОГИКА КАЛЕНДАРЯ ---
async function loadCalendarEvents() {
    const monthInput = document.getElementById('calendar-month-select');
    if (!monthInput || !monthInput.value) return;
    const targetPeriod = monthInput.value; // YYYY-MM

    try {
        const res = await fetch(`/api/events/month/${targetPeriod}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        cachedEvents = data.events || [];
        cachedRsvps = data.rsvps || [];
        renderGoogleCalendar();
    } catch (err) {
        console.error(err);
    }
}

function renderGoogleCalendar() {
    const monthInput = document.getElementById('calendar-month-select');
    const grid = document.getElementById('calendar-grid-body');
    if (!monthInput || !grid) return;

    grid.innerHTML = '';
    const [year, month] = monthInput.value.split('-').map(Number);

    const firstDay = new Date(year, month - 1, 1);
    let startDayOfWeek = firstDay.getDay(); 
    if (startDayOfWeek === 0) startDayOfWeek = 7; // Переводим ВС на 7 место

    const daysInMonth = new Date(year, month, 0).getDate();

    // Пустые ячейки в начале месяца
    for (let i = 1; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        grid.appendChild(emptyCell);
    }

    // Отрисовка дней месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(month).padStart(2, '0');
        const fullDateStr = `${year}-${monthStr}-${dayStr}`;

        cell.innerHTML = `<div class="day-number">${day}</div>`;

        // Ищем события на этот день
        const dayEvents = cachedEvents.filter(e => e.event_date === fullDateStr);
        if (dayEvents.length > 0) {
            cell.classList.add('has-events');
            const badge = document.createElement('div');
            badge.className = 'event-badge-counter counter-badge-clickable';
            badge.innerText = `Событий: ${dayEvents.length}`;
            cell.appendChild(badge);
        }

        // Железобетонный клик по дню на ПК и смартфонах
        cell.onclick = (e) => {
            currentSelectedDateStr = fullDateStr; 
            openDayModal(fullDateStr);
        };

        grid.appendChild(cell);
    }
}

function openDayModal(dateStr) {
    currentSelectedDateStr = dateStr;
    const dayModal = document.getElementById('day-modal');
    if (!dayModal) return;
    
    dayModal.classList.remove('hidden');
    dayModal.style.display = 'block'; 
    dayModal.style.zIndex = '3500'; 
    
    const titleElem = document.getElementById('modal-day-title');
    if (titleElem) {
        const parts = dateStr.split('-');
        titleElem.innerText = `События на ${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    
    renderDayEventsDetails();
}

function renderDayEventsDetails() {
    const listContainer = document.getElementById('day-events-details-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    const dayEvents = cachedEvents.filter(e => e.event_date === currentSelectedDateStr);
    const isManager = currentRole === 'speaker' || currentRole === 'admin' || 
                      (document.getElementById('speaker-view') && !document.getElementById('speaker-view').classList.contains('hidden'));

    // Кнопка добавления создается ПЕРВОЙ и ВСЕГДА видна методологу/админу
    if (isManager) {
        const createBtn = document.createElement('button');
        createBtn.className = "btn-primary";
        createBtn.style.cssText = "width:100%; margin-bottom:20px; font-size:0.9rem; padding:12px; background: #b59473; color: #000; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; display: block !important;";
        createBtn.innerText = "➕ Добавить событие в этот день";
        createBtn.onclick = () => {
            triggerCreateEvent("12:00"); 
        };
        listContainer.appendChild(createBtn);
    }

    if (dayEvents.length === 0) {
        const noEventsParagraph = document.createElement('p');
        noEventsParagraph.style.cssText = "padding:20px; text-align:center; color: var(--text-muted); width: 100%;";
        noEventsParagraph.innerText = "Событий не запланировано.";
        listContainer.appendChild(noEventsParagraph);
        return; 
    }

    dayEvents.forEach(e => {
        const card = document.createElement('div');
        card.style.cssText = "position:relative; margin-bottom:15px; background:#111; padding:15px; border-radius:4px; border-left: 3px solid #b59473;";
        
        let actionButtonsHtml = '';
        if (isManager) {
            actionButtonsHtml = `
                <button class="btn-primary" style="padding:6px 12px; font-size:0.8rem; margin-top:10px;" 
                    onclick="triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                    Редактировать / Удалить
                </button>
            `;
        } else {
            const userRsvp = cachedRsvps.find(r => r.event_id === e.id);
            if (userRsvp) {
                actionButtonsHtml = `<div style="font-weight:600; margin-top:10px; color:#b59473;">${userRsvp.status === 'going' ? '✓ Вы записаны' : '✕ Вы отказались'}</div>`;
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
        if (isManager) {
            adminCounterHtml = `
                <div style="margin-top:12px; border-top:1px solid #222; padding-top:8px; font-size:0.85rem;">
                    <span style="color:#b59473; cursor:pointer; text-decoration:underline;" 
                          onclick="window.currentDetailedEventId = ${e.id}; openAttendeesModalFromCache();">
                        Список участников (${e.going_count || 0} чел.)
                    </span>
                </div>
            `;
        }

        card.innerHTML = `
            <h4 style="color:#fff; font-size:1rem; margin:0;">${e.title}</h4>
            <p style="margin-top:8px; font-size:0.85rem; color:#ccc;">🕒 Время: <strong>${e.event_time}</strong></p>
            <p style="font-size:0.85rem; color:#ccc; margin-bottom:5px;">📍 Адрес: <strong>${e.address}</strong></p>
            ${actionButtonsHtml}
            ${adminCounterHtml}
        `;
        listContainer.appendChild(card);
    });
}

// Интеграция с вашей формой создания событий
function triggerCreateEvent(defaultTime = "12:00") {
    // Закрываем окно просмотра дня
    const dayModal = document.getElementById('day-modal');
    if (dayModal) dayModal.classList.add('hidden');

    // Находим форму/модалку создания события в вашей верстке
    const createModal = document.getElementById('create-event-modal') || document.getElementById('event-form-modal');
    if (!createModal) {
        // Подстраховка на случай, если форма создания вызывается через кастомный prompt
        const title = prompt("Введите название события:");
        if (!title) return;
        const address = prompt("Введите адрес локации:", "Пресненская наб., 12");
        
        fetch('/api/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title, event_date: currentSelectedDateStr, event_time: defaultTime, address })
        }).then(() => loadCalendarEvents());
        return;
    }

    // Если модалка в HTML есть, заполняем её поля данными
    createModal.classList.remove('hidden');
    createModal.style.display = 'block';

    const dateInput = document.getElementById('form-event-date') || document.getElementById('create-event-date');
    if (dateInput) dateInput.value = currentSelectedDateStr;

    const timeInput = document.getElementById('form-event-time') || document.getElementById('create-event-time');
    if (timeInput) timeInput.value = defaultTime;
}
