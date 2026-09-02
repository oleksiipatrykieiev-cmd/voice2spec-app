let currentMarkdownContent = '';
let currentFileSha = null;
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];
let editingTaskIndex = null; // Переменная для режима добавления правки

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

    // Сброс режима правки при смене модуля
    editingTaskIndex = null;
    document.getElementById('ideaText').placeholder = "Новая идея или уточнение...";

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
    // Ищем только главные задачи (подветки правок остаются скрытыми в UI, но живут в коде)
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
                ${!isDone ? `<button onclick="editTask(${index}, '${taskText.replace(/'/g, "\\'")}')" class="p-1 hover:bg-slate-700 rounded text-sky-400" title="Добавить правку/медиа">💬</button>` : ''}
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

// Переход в режим добавления правки
function editTask(lineIndex, oldText) {
    editingTaskIndex = lineIndex;
    const shortText = oldText.length > 25 ? oldText.substring(0, 25) + '...' : oldText;
    document.getElementById('ideaText').placeholder = `Правка к: ${shortText}`;
    document.getElementById('ideaText').focus();
    showLog('💬 Режим правки. Надиктуйте комментарий или прикрепите файлы.');
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

// Основная функция отправки (Мульти-файлы + ИИ для новых идей / Прямая запись для правок)
async function processAndPush() {
    const openaiKey = localStorage.getItem('openai_key');
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const userIdea = document.getElementById('ideaText').value.trim();
    const fileInput = document.getElementById('mediaInput');

    if (!openaiKey || !githubToken || !repoName) return alert('Заполни ключи в настройках!');
    if (!userIdea && (!fileInput || !fileInput.files || fileInput.files.length === 0)) return alert('Введи идею/правку или прикрепи файлы!');

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;

    try {
        let uploadedImagesMarkdown = [];
        let openAiImagesPayload = [];

        // 1. Загрузка ВСЕХ прикрепленных файлов в GitHub
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            showLog(`📷 Загрузка файлов (${fileInput.files.length} шт.)...`);
            
            for (let i = 0; i < fileInput.files.length; i++) {
                const file = fileInput.files[i];
                const base64Content = await fileToBase64(file);
                const fileName = `img_${Date.now()}_${i}.${file.name.split('.').pop()}`;
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
                    uploadedImagesMarkdown.push(`![Медиа](media/${fileName})`);
                    openAiImagesPayload.push({
                        type: 'image_url',
                        image_url: { url: `data:${file.type};base64,${base64Content}` }
                    });
                }
            }
        }

        const joinedImagesForMarkdown = uploadedImagesMarkdown.join(' ');

        // ВЕТВЛЕНИЕ: ПРАВКА ИЛИ НОВАЯ ИДЕЯ
        if (editingTaskIndex !== null) {
            // === РЕЖИМ ПРАВКИ (Без вызова ИИ, просто дописываем ветку комментариев) ===
            showLog('📝 Добавление правки в файл...');
            const lines = currentMarkdownContent.split('\n');
            const commentText = userIdea ? userIdea : 'Прикреплены дополнительные материалы';
            
            // Формируем отступ и пометку комментария с картинками
            const newNote = `  - 💬 **Правка:** ${commentText} ${joinedImagesForMarkdown}`.trimRight();
            
            // Вставляем сразу под родительской задачей
            lines.splice(editingTaskIndex + 1, 0, newNote);
            
            await saveMarkdownDirectly(lines.join('\n'), 'feat(spec): добавить правку/файлы к задаче');
            
            // Сбрасываем режим правки
            editingTaskIndex = null;
            document.getElementById('ideaText').placeholder = "Новая идея или уточнение...";

        } else {
            // === РЕЖИМ НОВОЙ ИДЕИ (Формирование через ИИ) ===
            showLog('🤖 Формирование задачи...');

            const systemPrompt = `Ты — ассистент-архитектор проекта VEI.
Твоя задача — сжато и четко сформулировать ПОЛЬЗОВАТЕЛЬСКУЮ ИДЕЮ в ОДНУ лаконичную задачу.

ПРАВИЛА:
1. НЕ создавай список подзадач.
2. НЕ придумывай отсебятину.
3. Сформулируй ровно ОДНУ емкую строку задачи с чекбоксом (- [ ]).
${joinedImagesForMarkdown ? `4. В конец строки обязательно добавь ссылки на загруженные файлы: ${joinedImagesForMarkdown}` : ''}

Пример формата:
- [ ] **[Идея] Название:** Краткая суть мысли пользователя.

Текущий файл:
${currentMarkdownContent}`;

            const userContent = [];
            if (userIdea) {
                userContent.push({ type: 'text', text: userIdea });
            } else {
                userContent.push({ type: 'text', text: 'Зафиксируй задачу на основе этих материалов.' });
            }

            // Добавляем все картинки в промпт для ИИ
            openAiImagesPayload.forEach(img => userContent.push(img));

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

            const commitText = userIdea ? `"${userIdea.slice(0, 25)}..."` : "с медиафайлами";
            await saveMarkdownDirectly(updatedMarkdown, `feat(spec): добавить идею ${commitText}`);
        }
        
        // Очистка полей ввода после любого действия
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