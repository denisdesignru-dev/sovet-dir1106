let token = localStorage.getItem('token') || '';
let currentRole = '';
let myChart = null;
let selectedResidentId = null;

// Хранилище оценок для колеса баланса, заполняемых самим резидентом
const selectedRatings = {
    business: null,
    team: null,
    health: null,
    relations: null
};

// Точка входа
if (token) {
    showMainSystem();
}

// Первоначальная генерация селекторов оценок для резидента
document.addEventListener("DOMContentLoaded", () => {
    const selectors = document.querySelectorAll('.rating-selector');
    
    selectors.forEach(selector => {
        const metricName = selector.getAttribute('data-metric');
        
        for (let i = 1; i <= 10; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rating-btn';
            btn.textContent = i;
            
            btn.addEventListener('click', () => {
                selector.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedRatings[metricName] = i;
            });
            
            selector.appendChild(btn);
        }
    });
});

// Авторизация
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

// Загрузка главного экрана
async function loadDashboardData() {
    const res = await fetch('/api/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    currentRole = data.type;
    
    document.getElementById('user-display-name').innerText = data.type === 'resident' ? 'Резидент' : 'Спикер/Методолог';

    if (data.type === 'resident') {
        document.getElementById('resident-view').classList.remove('hidden');
        document.getElementById('speaker-view').classList.add('hidden');
        
        document.getElementById('res-name').innerText = data.profile.full_name;
        document.getElementById('res-company').innerText = data.profile.company;
        document.getElementById('res-niche').innerText = data.profile.niche;
        document.getElementById('res-turnover').innerText = data.profile.turnover;
        
        // Рендерим блок рекомендаций в красивых карточках
        const recBlock = document.getElementById('recommendations-block');
        recBlock.innerHTML = data.metrics.map(m => `
            <div class="rec-item-card">
                <strong>Период: ${m.date_period}</strong>
                <p style="margin-top: 10px; font-size: 0.9rem; color: #f5f5f4;">
                    ${m.recommendations || 'Официальные рекомендации формируются спикерами...'}
                </p>
            </div>
        `).join('');
        
        renderChart(data.metrics);
    } else {
        document.getElementById('speaker-view').classList.remove('hidden');
        document.getElementById('resident-view').classList.add('hidden');
        
        const listContainer = document.getElementById('residents-list');
        listContainer.innerHTML = data.residents.map(r => `
            <div class="resident-item" onclick="openEditor(${r.id}, '${r.full_name}')">
                <h4>${r.full_name}</h4>
                <p>${r.company} (${r.niche})</p>
            </div>
        `).join('');
    }
    loadCalendar();
}

// Отрисовка графика Chart.js
function renderChart(metrics) {
    const ctx = document.getElementById('metricsChart').getContext('2d');
    if(myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: metrics.map(m => m.date_period),
            datasets: [
                { label: 'Бизнес', data: metrics.map(m => m.business_score), borderColor: '#b59473', tension: 0.3, backgroundColor: 'transparent' },
                { label: 'Команда', data: metrics.map(m => m.team_score), borderColor: '#ffffff', tension: 0.3, backgroundColor: 'transparent' },
                { label: 'Здоровье', data: metrics.map(m => m.health_score), borderColor: '#ff4444', tension: 0.3, backgroundColor: 'transparent' }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8c8a85', font: { family: 'Montserrat' } } } },
            scales: {
                x: { grid: { color: '#242422' }, ticks: { color: '#8c8a85' } },
                y: { grid: { color: '#242422' }, ticks: { color: '#8c8a85' }, min: 1, max: 10 }
            }
        }
    });
}

// Отправка метрик САМИМ РЕЗИДЕНТОМ (1 раз в месяц)
async function saveResidentSelfMetrics(event) {
    event.preventDefault();
    const period = document.getElementById('periodSelect').value;

    if (!selectedRatings.business || !selectedRatings.team || !selectedRatings.health || !selectedRatings.relations) {
        alert("Пожалуйста, оцените все 4 аспекта перед сохранением.");
        return;
    }

    try {
        const response = await fetch('/api/metrics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                period: period,
                business: selectedRatings.business,
                team: selectedRatings.team,
                health: selectedRatings.health,
                relations: selectedRatings.relations
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            loadDashboardData(); // Перезагружаем для обновления графика
        } else {
            alert("Ошибка: " + data.error);
        }
    } catch (error) {
        alert("Не удалось связаться с сервером.");
    }
}

// Открытие редактора СПИКЕРОМ
async function openEditor(residentId, name) {
    selectedResidentId = residentId;
    document.getElementById('editor-block').classList.remove('hidden');
    document.getElementById('edit-resident-title').innerText = `Управление трекенгом: ${name}`;
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const metrics = await res.json();
    if(metrics.length > 0) {
        const last = metrics[metrics.length - 1];
        document.getElementById('score-biz').value = last.business_score;
        document.getElementById('score-team').value = last.team_score;
        document.getElementById('score-health').value = last.health_score;
        document.getElementById('edit-comments').value = last.comments || '';
        document.getElementById('edit-recs').value = last.recommendations || '';
    } else {
        document.getElementById('score-biz').value = '';
        document.getElementById('score-team').value = '';
        document.getElementById('score-health').value = '';
        document.getElementById('edit-comments').value = '';
        document.getElementById('edit-recs').value = '';
    }
}

// Сохранение изменений СПИКЕРОМ
async function saveSpeakerTrackingMetrics() {
    const payload = {
        resident_id: selectedResidentId,
        date_period: document.getElementById('edit-period').value,
        business: document.getElementById('score-biz').value,
        team: document.getElementById('score-team').value,
        health: document.getElementById('score-health').value,
        comments: document.getElementById('edit-comments').value,
        recommendations: document.getElementById('edit-recs').value
    };

    const res = await fetch('/api/metrics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    
    if(res.ok) {
        alert('Изменения сохранены под защитой NDA');
        loadDashboardData();
    } else {
        alert('Ошибка при сохранении данных методолога');
    }
}

// Календарь
async function loadCalendar() {
    const res = await fetch('/api/events', { headers: { 'Authorization': `Bearer ${token}` } });
    const events = await res.json();
    const container = document.getElementById('calendar-list');
    container.innerHTML = events.map(e => `
        <div class="event-item">
            <h4>${e.title}</h4>
            <p>${e.description}</p>
            <p><small style="color: var(--color-gold);">Дата: ${e.event_date} (${e.event_type === 'private' ? 'Приватный Совет' : 'Общая встреча'})</small></p>
            <button onclick="confirmRSVP(${e.id})">Подтвердить участие</button>
        </div>
    `).join('');
}

async function confirmRSVP(eventId) {
    await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId })
    });
    alert('Ваше участие успешно подтверждено!');
}

// Переключение вкладок
function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
}
