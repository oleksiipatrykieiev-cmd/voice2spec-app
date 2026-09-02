let currentMarkdownContent = '';
let currentFileSha = null;
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('geminiKey').value = localStorage.getItem('openai_key') || '';
    document.getElementById('githubToken').value = localStorage.getItem('githubToken') || '';
    document.getElementById('repoName').value = localStorage.getItem('repo_name') || '';
    renderBranches();
    if (branches.length > 0) loadTasksFromGithub();
});

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
        item.innerHTML = `<span>${b.name} <span class="text-slate-500">(${b.file})</span></span>
            <button onclick="removeBranch(${index})" class="text-rose-400 font-bold px-1">✕</button>`;
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
    loadTasksFromGithub();
}

function showLog(msg) {
    document.getElementById('statusLog').innerText = msg;
}

// Загрузка и парсинг задач из GitHub
async function loadTasksFromGithub() {
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const tasksList = document.getElementById('tasksList');

    if (!githubToken || !repoName || !filePath) return;

    tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">⏳ Загрузка задач...</div>';

    try {
        const ghUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
        const res = await fetch(ghUrl, { headers: { 'Authorization': `token ${githubToken}` } });

        if (res.ok) {
            const data = await res.json();
            currentFileSha = data.sha;
            currentMarkdownContent = decodeURIComponent(escape(atob(data.content)));
            renderTasksList(currentMarkdownContent);
        } else {
            tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">Файл задач еще не создан</div>';
            currentMarkdownContent = `# Архитектура модуля\n\n## Задачи\n`;
            currentFileSha = null;
        }
    } catch (e) {
        showLog('❌ Ошибка загрузки задач: ' + e.message);
    }
}

function renderTasksList(markdown) {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';

    const lines = markdown.split('\n');
    const taskLines = lines.map((line, index) => ({ line, index })).filter(item => item.line.trim().startsWith('- ['));

    if (taskLines.length === 0) {
        tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">Задач пока нет</div>';
        return;
    }

    taskLines.forEach(({ line, index }) => {
        const isDone = line.includes('- [x]');
        const taskText = line.replace(/- \[[ x]\]\s*/, '');

        const card = document.createElement('div');
        card.className = `flex items-center justify-between p-2.5 rounded-xl text-xs border ${isDone ? 'bg-slate-950/50 border-slate-800 text-slate-500 line-through' : 'bg-slate-800 border-slate-700 text-slate-200'}`;

        card.innerHTML = `
            <div class="flex items-center gap-2 flex-1 pr-2">
                <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTaskDone(${index})" class="rounded border-slate-700 text-indigo-600 focus:ring-0">
                <span class="break-all">${taskText}</span>
            </div>
            <div class="flex gap-1">
                ${!isDone ? `<button onclick="editTask(${index}, '${taskText.replace(/'/g, "\\'")}')" class="p-1 hover:bg-slate-700 rounded text-slate-400">✏️</button>` : ''}
                <button onclick="${isDone ? `rollbackTask(${index})` : `deleteTask(${index})`}" class="p-1 hover:bg-slate-700 rounded text-rose-400" title="${isDone ? 'Откатить реализацию' : 'Удалить'}">
                    ${isDone ? '↩️' : '🗑️'}
                </button>
            </div>
        `;
        tasksList.appendChild(card);
    });
}

// Прямые манипуляции с файлом на GitHub (Без ИИ)
async function saveMarkdownDirectly(newMarkdown, commitMsg) {
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;

    showLog('🚀 Обновление файла...');

    try {
        const ghUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
        const putBody = {
            message: commitMsg,
            content: btoa(unescape(encodeURIComponent(newMarkdown))),
            branch: 'main'
        };
        if (currentFileSha) putBody.sha = currentFileSha;

        const res = await fetch(ghUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(putBody)
        });

        if (res.ok) {
            showLog('✅ Сохранено!');
            await loadTasksFromGithub();
        }
    } catch (e) {
        showLog('❌ Ошибка сохранения: ' + e.message);
    }
}

function toggleTaskDone(lineIndex) {
    const lines = currentMarkdownContent.split('\n');
    if (lines[lineIndex].includes('- [ ]')) {
        lines[lineIndex] = lines[lineIndex].replace('- [ ]', '- [x]');
    } else {
        lines[lineIndex] = lines[lineIndex].replace('- [x]', '- [ ]');
    }
    saveMarkdownDirectly(lines.join('\n'), 'fix(spec): переключить статус задачи');
}

function deleteTask(lineIndex) {
    const lines = currentMarkdownContent.split('\n');
    lines.splice(lineIndex, 1);
    saveMarkdownDirectly(lines.join('\n'), 'fix(spec): удалить задачу');
}

function rollbackTask(lineIndex) {
    const lines = currentMarkdownContent.split('\n');
    const cleanText = lines[lineIndex].replace(/- \[[ x]\]\s*/, '');
    lines[lineIndex] = `- [ ] (ОТМЕНИТЬ И УДАЛИТЬ ИЗ КОДА): ${cleanText}`;
    saveMarkdownDirectly(lines.join('\n'), 'fix(spec): запрос на откат задачи');
}

function editTask(lineIndex, oldText) {
    document.getElementById('ideaText').value = oldText;
    deleteTask(lineIndex);
}

// Голосовой ввод
let recognition;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            transcript += e.results[i][0].transcript;
        }
        document.getElementById('ideaText').value = transcript;
    };
}

function toggleRecord() {
    if (!recognition) return alert('Голосовой ввод не поддерживается браузером.');
    if (!isRecording) {
        recognition.start();
        isRecording = true;
        document.getElementById('recordStatus').innerText = 'Запись...';
        document.getElementById('recordBtn').classList.add('bg-amber-600', 'animate-pulse');
    } else {
        recognition.stop();
        isRecording = false;
        document.getElementById('recordStatus').innerText = 'Запись голоса';
        document.getElementById('recordBtn').classList.remove('bg-amber-600', 'animate-pulse');
    }
}

// Вспомогательная функция для конвертации картинки в Base64
const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

// Запрос к OpenAI при добавлении новой идеи (Текст + Картинка)
async function processAndPush() {
    const openaiKey = localStorage.getItem('openai_key');
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const userIdea = document.getElementById('ideaText').value.trim();
    const fileInput = document.getElementById('mediaInput');

    if (!openaiKey || !githubToken || !repoName) return alert('Заполни ключи в настройках!');
    if (!userIdea && (!fileInput || !fileInput.files || !fileInput.files[0])) return alert('Введи идею или прикрепи фото!');

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    showLog('🚀 Обработка данных...');

    try {
        let imageUrlForMarkdown = '';

        // 1. Загрузка фото в GitHub (если прикреплено)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            showLog('📷 Загрузка медиафайла в репозиторий...');
            const file = fileInput.files[0];
            const base64Content = await fileToBase64(file);
            const fileName = `img_${Date.now()}.${file.name.split('.').pop()}`;
            const githubMediaPath = `docs/media/${fileName}`;

            const ghRes = await fetch(`https://api.github.com/repos/${repoName}/contents/${githubMediaPath}`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `upload media ${fileName}`,
                    content: base64Content,
                    branch: 'main'
                })
            });

            if (ghRes.ok) {
                imageUrlForMarkdown = `media/${fileName}`;
            } else {
                showLog('⚠️ Ошибка загрузки медиа, продолжаем без него');
            }
        }

        showLog('🤖 Анализ идеи...');

        // 2. Формирование упрощенного Промпта
        const systemPrompt = `Ты — ассистент-архитектор проекта VEI.
Твоя задача — сжато и четко сформулировать ПОЛЬЗОВАТЕЛЬСКУЮ ИДЕЮ в ОДНУ лаконичную задачу.

ПРАВИЛА:
1. НЕ создавай список подзадач.
2. НЕ придумывай отсебятину и технические шаги.
3. Сформулируй ровно ОДНУ емкую строку задачи с чекбоксом (- [ ]).
${imageUrlForMarkdown ? `4. Если есть медиафайл, добавь ссылку на него в конец задачи: ![Скриншот](${imageUrlForMarkdown})` : ''}

Пример формата:
- [ ] **[Идея] Название:** Краткая суть мысли пользователя.

Текущий файл:
${currentMarkdownContent}`;

        const userContent = [];
        if (userIdea) {
            userContent.push({ type: 'text', text: userIdea });
        } else {
            userContent.push({ type: 'text', text: 'Проанализируй этот медиафайл и опиши задачу.' });
        }

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const base64Img = await fileToBase64(fileInput.files[0]);
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:${fileInput.files[0].type};base64,${base64Img}` }
            });
        }

        // 3. Запрос к OpenAI
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ]
            })
        });

        const aiData = await aiRes.json();
        const updatedMarkdown = aiData.choices[0].message.content.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');

        // 4. Обновление файла на GitHub
        const commitText = userIdea ? `"${userIdea.slice(0, 25)}..."` : "с медиафайлом";
        await saveMarkdownDirectly(updatedMarkdown, `feat(spec): добавить идею ${commitText}`);
        
        // 5. Очистка полей ввода
        document.getElementById('ideaText').value = '';
        if (fileInput) {
            fileInput.value = '';
            document.getElementById('fileNameDisplay').innerText = 'Прикрепить фото/скриншот';
        }

    } catch (e) {
        showLog('❌ Ошибка: ' + e.message);
    } finally {
        sendBtn.disabled = false;
    }
}