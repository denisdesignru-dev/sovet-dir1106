let token = localStorage.getItem('token') || '';
let currentRole = ''; 
let cachedEvents = [];
let cachedRsvps = [];
let currentSelectedDateStr = ''; 

// Главный инициализатор приложения
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем токен напрямую без вызова несуществующей функции
    if (token) {
        showMainSpace();
    } else {
        showLoginSpace();
    }
    setupNavigation();
});

// Интеграция функции входа с index.html (onclick="handleLogin()")
async function handleLogin() {
    const emailElem = document.getElementById('email');
    const passwordElem = document.getElementById('password');
    const errorBlock = document.getElementById('login-error');
    
    if (!emailElem || !passwordElem) return;
    if (errorBlock) errorBlock.classList.add('hidden');

    const email = emailElem.value;
    const password = passwordElem.value;

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
        console.error("Ошибка при авторизации:", err);
    }
}

function showLoginSpace() {
    if (document.getElementById('auth-screen')) document.getElementById('auth-screen').classList.remove('hidden');
    if (document.getElementById('main-screen')) document.getElementById('main-screen').classList.add('hidden');
}

function showMainSpace() {
    if (document.getElementById('auth-screen')) document.getElementById('auth-screen').classList.add('hidden');
    if (document.getElementById('main-screen')) document.getElementById('main-screen').classList.remove('hidden');
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
        
        if (data.type === 'admin' || data.type === 'speaker') {
            currentRole = data.type; 
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.add('hidden');
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.remove('hidden');
            renderRegistry(data.residents);
        } else {
            currentRole = 'resident';
            if (document.getElementById('speaker-view')) document.getElementById('speaker-view').classList.add('hidden');
            if (document.getElementById('resident-view')) document.getElementById('resident-view').classList.remove('hidden');
            renderResidentDashboard(data);
        }
        
        const now = new Date();
        const monthInput = document.getElementById('calendar-month-select');
        if (monthInput && !monthInput.value) {
            monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        await loadCalendarEvents();
    } catch (err) {
        console.error("Ошибка загрузки дашборда:", err);
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
    if (monthSelect) monthSelect.addEventListener('change', loadCalendarEvents);

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

async function loadCalendarEvents() {
    const monthInput = document.getElementById('calendar-month-select');
    if (!monthInput || !monthInput.value) return;
    try {
        const res = await fetch(`/api/events/month/${monthInput.value}`, {
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
    if (startDayOfWeek === 0) startDayOfWeek = 7;

    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        const fullDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        cell.innerHTML = `<div class="cell-day-number">${day}</div>`;

        const dayEvents = cachedEvents.filter(e => e.event_date === fullDateStr);
        if (dayEvents.length > 0) {
            cell.classList.add('has-events');
            const badge = document.createElement('div');
            badge.className = 'counter-badge-clickable';
            badge.style.cssText = "background:#b59473; color:#000; font-size:0.75rem; padding:2px 6px; border-radius:3px; margin-top:5px; text-align:center; font-weight:bold;";
            badge.innerText = `Событий: ${dayEvents.length}`;
            cell.appendChild(badge);
        }

        cell.onclick = () => {
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
    const isManager = currentRole === 'speaker' || currentRole === 'admin';

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
        card.style.cssText = "position:relative; margin-bottom:15px; background:#141414; padding:15px; border-radius:4px; border-left: 3px solid #b59473; border: 1px solid #222;";
        
        let actionButtonsHtml = '';
        if (isManager) {
            actionButtonsHtml = `
                <button class="btn-primary" style="padding:6px 12px; font-size:0.8rem; margin-top:10px;" 
                    onclick="triggerEditEvent(${e.id}, '${e.title}', '${e.event_time}', '${e.address}', '${e.event_date}')">
                    Редактировать
                </button>
            `;
        }

        card.innerHTML = `
            <h4 style="color:#fff; font-size:1rem; margin:0;">${e.title}</h4>
            <p style="margin-top:8px; font-size:0.85rem; color:#ccc;">🕒 Время: <strong>${e.event_time}</strong></p>
            <p style="font-size:0.85rem; color:#ccc; margin-bottom:5px;">📍 Адрес: <strong>${e.address}</strong></p>
            ${actionButtonsHtml}
        `;
        listContainer.appendChild(card);
    });
}

function triggerCreateEvent(defaultTime = "12:00") {
    const dayModal = document.getElementById('day-modal');
    if (dayModal) dayModal.classList.add('hidden');

    const editorModal = document.getElementById('editor-modal');
    if (editorModal) {
        editorModal.classList.remove('hidden');
        
        document.getElementById('edit-event-id').value = '';
        document.getElementById('event-title-input').value = '';
        document.getElementById('event-date-input').value = currentSelectedDateStr;
        document.getElementById('event-time-input').value = defaultTime;
        document.getElementById('event-address-input').value = '';
        
        document.getElementById('editor-modal-title').innerText = "Создание события";
        if(document.getElementById('btn-delete-event')) {
            document.getElementById('btn-delete-event').style.display = 'none';
        }
    }
}

window.triggerEditEvent = function(id, title, time, address, date) {
    const dayModal = document.getElementById('day-modal');
    if (dayModal) dayModal.classList.add('hidden');

    const editorModal = document.getElementById('editor-modal');
    if (editorModal) {
        editorModal.classList.remove('hidden');
        
        document.getElementById('edit-event-id').value = id;
        document.getElementById('event-title-input').value = title;
        document.getElementById('event-date-input').value = date;
        document.getElementById('event-time-input').value = time;
        document.getElementById('event-address-input').value = address;
        
        document.getElementById('editor-modal-title').innerText = "Настройка события";
        if(document.getElementById('btn-delete-event')) {
            document.getElementById('btn-delete-event').style.display = 'block';
        }
    }
}

window.closeEditorModal = function() {
    const editorModal = document.getElementById('editor-modal');
    if (editorModal) editorModal.classList.add('hidden');
}

window.saveEventFromModal = async function() {
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('event-title-input').value;
    const event_date = document.getElementById('event-date-input').value;
    const event_time = document.getElementById('event-time-input').value;
    const address = document.getElementById('event-address-input').value;

    if (!title || !event_date) {
        alert("Заполните название и дату мероприятия");
        return;
    }

    const url = id ? `/api/events/${id}` : '/api/events/create';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title, event_date, event_time, address })
        });
        if (res.ok) {
            closeEditorModal();
            await loadCalendarEvents();
        }
    } catch (err) {
        console.error(err);
    }
}

window.deleteEventFromModal = async function() {
    const id = document.getElementById('edit-event-id').value;
    if (!id) return;

    if (!confirm("Вы уверены, что хотите удалить это событие?")) return;

    try {
        const res = await fetch(`/api/events/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            closeEditorModal();
            await loadCalendarEvents();
        }
    } catch (err) {
        console.error(err);
    }
}

// Управление модальными окнами добавления резидентов методологом (из index.html)
window.openAddResidentModal = function() {
    const modal = document.getElementById('add-resident-modal');
    if (modal) modal.classList.remove('hidden');
}

window.closeAddResidentModal = function() {
    const modal = document.getElementById('add-resident-modal');
    if (modal) modal.classList.add('hidden');
}

window.saveResident = async function() {
    const fullName = document.getElementById('new-res-name').value;
    const email = document.getElementById('new-res-email').value;
    const company = document.getElementById('new-res-company').value;
    const niche = document.getElementById('new-res-niche').value;
    const turnover = document.getElementById('new-res-turnover').value;
    const entryRequest = document.getElementById('new-res-request').value;

    if (!fullName || !email) {
        alert("Имя и Email обязательны для заполнения!");
        return;
    }

    try {
        const res = await fetch('/api/residents/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ fullName, email, company, niche, turnover, entryRequest })
        });
        const data = await res.json();
        if (res.ok) {
            closeAddResidentModal();
            // Очищаем форму
            document.getElementById('new-res-name').value = '';
            document.getElementById('new-res-email').value = '';
            document.getElementById('new-res-company').value = '';
            document.getElementById('new-res-niche').value = '';
            document.getElementById('new-res-turnover').value = '';
            document.getElementById('new-res-request').value = '';
            // Обновляем список
            await loadDashboardData();
        } else {
            alert(data.error || "Ошибка при создании резидента");
        }
    } catch (err) {
        console.error(err);
    }
}

window.openResidentProfile = async function(id) {
    try {
        const res = await fetch(`/api/resident/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        
        if (document.getElementById('profile-full-name')) document.getElementById('profile-full-name').innerText = data.profile.full_name || '-';
        if (document.getElementById('profile-company')) document.getElementById('profile-company').innerText = data.profile.company || '-';
        if (document.getElementById('profile-niche')) document.getElementById('profile-niche').innerText = data.profile.niche || '-';
        if (document.getElementById('profile-turnover')) document.getElementById('profile-turnover').innerText = data.profile.turnover || '-';
        if (document.getElementById('profile-entry-request')) document.getElementById('profile-entry-request').innerText = data.profile.entry_request || '-';
        
        const detailsBlock = document.getElementById('resident-details-block');
        if (detailsBlock) detailsBlock.classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}

window.closeResidentDetails = function() {
    const detailsBlock = document.getElementById('resident-details-block');
    if (detailsBlock) detailsBlock.classList.add('hidden');
}
