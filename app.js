// Загрузка настроек при старте
document.getElementById('geminiKey').value = localStorage.getItem('openai_key') || '';
document.getElementById('githubToken').value = localStorage.getItem('github_token') || '';
document.getElementById('repoName').value = localStorage.getItem('repo_name') || '';

// Инициализация веток из localStorage
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];
renderBranches();

function toggleSettings() {
    document.getElementById('settings').classList.toggle('hidden');
}

function addBranch() {
    const input = document.getElementById('newBranchName');
    const name = input.value.trim();
    if (!name) return;

    const fileName = 'docs/' + name.toLowerCase().replace(/[^a-z0-9а-я]/g, '_') + '.md';
    branches.push({ name: name, file: fileName });
    input.value = '';
    renderBranches();
}

function removeBranch(index) {
    branches.splice(index, 1);
    renderBranches();
}

function renderBranches() {
    const listContainer = document.getElementById('branchesList');
    const selectContainer = document.getElementById('moduleSelect');

    listContainer.innerHTML = '';
    selectContainer.innerHTML = '';

    if (branches.length === 0) {
        selectContainer.innerHTML = '<option value="">(Добавьте ветку в ⚙️)</option>';
        listContainer.innerHTML = '<div class="text-xs text-slate-500 italic">Нет добавленных веток</div>';
        return;
    }

    branches.forEach((b, index) => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center bg-slate-900 p-2 rounded-lg text-xs';
        item.innerHTML = `
            <span>${b.name} <span class="text-slate-500">(${b.file})</span></span>
            <button onclick="removeBranch(${index})" class="text-rose-400 hover:text-rose-300 font-bold px-1">✕</button>
        `;
        listContainer.appendChild(item);

        const option = document.createElement('option');
        option.value = b.file;
        option.textContent = b.name;
        selectContainer.appendChild(option);
    });
}

function saveSettings() {
    localStorage.setItem('openai_key', document.getElementById('geminiKey').value.trim());
    localStorage.setItem('github_token', document.getElementById('githubToken').value.trim());
    localStorage.setItem('repo_name', document.getElementById('repoName').value.trim());
    localStorage.setItem('app_branches', JSON.stringify(branches));
    
    toggleSettings();
    showLog('✅ Настройки сохранены!');
}

function showLog(msg) {
    document.getElementById('statusLog').innerText = msg;
}

// Голосовой ввод (Web Speech API)
let recognition;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        document.getElementById('ideaText').value = transcript;
    };

    recognition.onerror = (e) => showLog('Ошибка записи: ' + e.error);
}

function toggleRecord() {
    if (!recognition) return alert('Голосовой ввод не поддерживается браузером.');
    
    if (!isRecording) {
        recognition.start();
        isRecording = true;
        document.getElementById('recordStatus').innerText = 'Идет запись... (нажми стоп)';
        document.getElementById('recordBtn').classList.add('bg-amber-600', 'animate-pulse');
    } else {
        recognition.stop();
        isRecording = false;
        document.getElementById('recordStatus').innerText = 'Запись голоса';
        document.getElementById('recordBtn').classList.remove('bg-amber-600', 'animate-pulse');
    }
}

// Запрос к OpenAI и отправка коммита в GitHub
async function processAndPush() {
    const openaiKey = localStorage.getItem('openai_key');
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const userIdea = document.getElementById('ideaText').value.trim();

    if (!openaiKey || !githubToken || !repoName) return alert('Заполни ключи в настройках (⚙️)!');
    if (!filePath) return alert('Создай и выбери хотя бы одну ветку в настройках!');
    if (!userIdea) return alert('Введи или наговори текст идеи!');

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    showLog('⏳ 1/3 Считываем файл с GitHub...');

    try {
        const ghUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
        let fileSha = null;
        let currentContent = `# Архитектура модуля\n\n## Задачи\n`;

        const getRes = await fetch(ghUrl, {
            headers: { 'Authorization': `token ${githubToken}` }
        });

        if (getRes.ok) {
            const fileData = await getRes.json();
            fileSha = fileData.sha;
            currentContent = decodeURIComponent(escape(atob(fileData.content)));
        }

        showLog('🤖 2/3 OpenAI (GPT-4o) структурирует идею...');

        const prompt = `Ты — AI-архитектор проекта. Ниже представлен текущий Markdown-файл спецификации модуля и новая идея от разработчика.
Обнови файл спецификации: аккуратно добавь новую идею в виде чекбокса задачи (- [ ]) или обнови логику/Mermaid-схему, если требуется. Верни ТОЛЬКО итоговый обновленный текст Markdown файла целиком без дополнительных пояснений.

Текущий файл:
${currentContent}

Новая идея:
${userIdea}`;

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const aiData = await aiRes.json();
        
        if (aiData.error) {
            throw new Error('OpenAI Error: ' + aiData.error.message);
        }

        const updatedMarkdown = aiData.choices[0].message.content.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');

        showLog('🚀 3/3 Отправляем коммит в GitHub...');

        const putBody = {
            message: `feat(spec): добавить идею "${userIdea.slice(0, 30)}..."`,
            content: btoa(unescape(encodeURIComponent(updatedMarkdown))),
            branch: 'main'
        };
        if (fileSha) putBody.sha = fileSha;

        const putRes = await fetch(ghUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putBody)
        });

        if (putRes.ok) {
            showLog('✅ Успешно задеплоено в GitHub!');
            document.getElementById('ideaText').value = '';
        } else {
            const err = await putRes.json();
            showLog('❌ Ошибка GitHub: ' + err.message);
        }

    } catch (e) {
        showLog('❌ Ошибка: ' + e.message);
    } finally {
        sendBtn.disabled = false;
    }
}