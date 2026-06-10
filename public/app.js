let token = localStorage.getItem('token') || '';
let currentRole = '';
let myChart = null;
let selectedResidentId = null;

if (token) showMainSystem();

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
    document.getElementById('user-display-name').innerText = data.type === 'resident' ? 'Резидент' : 'Спикер/Методолог';

    if (data.type === 'resident') {
        document.getElementById('resident-view').classList.remove('hidden');
        document.getElementById('res-name').innerText = data.profile.full_name;
        document.getElementById('res-company').innerText = data.profile.company;
        document.getElementById('res-niche').innerText = data.profile.niche;
        document.getElementById('res-turnover').innerText = data.profile.turnover;
        
        // Выводим рекомендации
        const recBlock = document.getElementById('recommendations-block');
        recBlock.innerHTML = data.metrics.map(m => `<strong>${m.date_period}:</strong> ${m.recommendations || 'Ожидает заполнения'}<br><br>`).join('');
        
        renderChart(data.metrics);
    } else {
        document.getElementById('speaker-view').classList.remove('hidden');
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

function renderChart(metrics) {
    const ctx = document.getElementById('metricsChart').getContext('2d');
    if(myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: metrics.map(m => m.date_period),
            datasets: [
                { label: 'Бизнес', data: metrics.map(m => m.business_score), borderColor: '#D4AF37', tension: 0.3 },
                { label: 'Команда', data: metrics.map(m => m.team_score), borderColor: '#ffffff', tension: 0.3 },
                { label: 'Здоровье', data: metrics.map(m => m.health_score), borderColor: '#ff4444', tension: 0.3 }
            ]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: 'white' } } } }
    });
}

async function openEditor(residentId, name) {
    selectedResidentId = residentId;
    document.getElementById('editor-block').classList.remove('hidden');
    document.getElementById('edit-resident-title').innerText = `Управление трекингом: ${name}`;
    
    const res = await fetch(`/api/resident/${residentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const metrics = await res.json();
    if(metrics.length > 0) {
        const last = metrics[metrics.length - 1];
        document.getElementById('score-biz').value = last.business_score;
        document.getElementById('score-team').value = last.team_score;
        document.getElementById('score-health').value = last.health_score;
        document.getElementById('edit-comments').value = last.comments;
        document.getElementById('edit-recs').value = last.recommendations;
    }
}

async function saveMetrics() {
    const payload = {
        resident_id: selectedResidentId,
        date_period: document.getElementById('edit-period').value,
        business: document.getElementById('score-biz').value,
        team: document.getElementById('score-team').value,
        health: document.getElementById('score-health').value,
        comments: document.getElementById('edit-comments').value,
        recommendations: document.getElementById('edit-recs').value
    };

    await fetch('/api/metrics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
    });
    alert('Изменения сохранены под защитой NDA');
}

async function loadCalendar() {
    const res = await fetch('/api/events', { headers: { 'Authorization': `Bearer ${token}` } });
    const events = await res.json();
    const container = document.getElementById('calendar-list');
    container.innerHTML = events.map(e => `
        <div class="event-item">
            <h4>${e.title}</h4>
            <p>${e.description}</p>
            <p><small>Дата проведения: ${e.event_date} (${e.event_type === 'private' ? 'Приватная встреча' : 'Общий совет'})</small></p>
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
    alert('Ваше участие подтверждено!');
}

function switchTab(tab) {
    document.getElementById('content-dashboard').classList.add('hidden');
    document.getElementById('content-calendar').classList.add('hidden');
    document.getElementById('tab-dashboard').classList.remove('active');
    document.getElementById('tab-calendar').classList.remove('active');
    
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');
}
