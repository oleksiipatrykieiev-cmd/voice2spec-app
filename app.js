let currentMarkdownContent = '';
let currentFileSha = null;
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];
let selectedParentTask = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('geminiKey').value = localStorage.getItem('openai_key') || '';
    document.getElementById('githubToken').value = localStorage.getItem('github_token') || '';
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

// Загрузка и рендеринг дерева задач
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
            renderTreeList(currentMarkdownContent);
        } else {
            tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">Файл задач еще не создан</div>';
            currentMarkdownContent = `# Архитектура модуля\n\n## Задачи\n`;
            currentFileSha = null;
        }
    } catch (e) {
        showLog('❌ Ошибка загрузки задач: ' + e.message);
    }
}

function renderTreeList(markdown) {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';

    const lines = markdown.split('\n');
    let hasTasks = false;

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [') || trimmed.startsWith('* [') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            hasTasks = true;

            // Определение глубины вложенности по пробелам
            const indentSpaces = line.search(/\S/);
            const indentLevel = Math.floor(indentSpaces / 2);

            const isCheckbox = line.includes('[ ]') || line.includes('[x]');
            const isDone = line.includes('[x]');
            const cleanText = line.replace(/^[\s-*]+(\[[ x]\])?\s*/, '');

            const card = document.createElement('div');
            card.style.marginLeft = `${indentLevel * 12}px`;
            card.className = `flex items-center justify-between p-2 my-1 rounded-xl text-xs border ${isDone ? 'bg-slate-950/40 border-slate-800 text-slate-500 line-through' : 'bg-slate-800/80 border-slate-700/80 text-slate-200'}`;

            card.innerHTML = `
                <div class="flex items-center gap-2 flex-1 min-w-0 pr-2">
                    ${isCheckbox ? `<input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTaskDone(${index})" class="rounded border-slate-700 text-indigo-600 focus:ring-0">` : '<span class="text-indigo-400">🔹</span>'}
                    <span class="break-all font-mono text-[11px]">${cleanText}</span>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="setReplyTarget(${index}, '${cleanText.replace(/'/g, "\\'")}')" class="p-1 hover:bg-indigo-900/50 rounded text-indigo-300" title="Добавить комментарий/ветку">💬</button>
                    ${isCheckbox ? `
                        <button onclick="${isDone ? `rollbackTask(${index})` : `deleteTask(${index})`}" class="p-1 hover:bg-slate-700 rounded text-rose-400" title="${isDone ? 'Откатить' : 'Удалить'}">
                            ${isDone ? '↩️' : '🗑️'}
                        </button>
                    ` : ''}
                </div>
            `;
            tasksList.appendChild(card);
        }
    });

    if (!hasTasks) {
        tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">Задач пока нет</div>';
    }
}

function setReplyTarget(lineIndex, text) {
    selectedParentTask = { index: lineIndex, text: text };
    document.getElementById('replyTargetText').innerText = text;
    document.getElementById('replyTargetBox').classList.remove('hidden');
    document.getElementById('ideaText').focus();
}

function cancelReply() {
    selectedParentTask = null;
    document.getElementById('replyTargetBox').classList.add('hidden');
}

// Прямые манипуляции с файлом на GitHub
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
            cancelReply();
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
    const cleanText = lines[lineIndex].replace(/^[ \t]*-[ \t]*\[[ x]\][ \t]*/, '');
    lines[lineIndex] = `- [ ] (ОТМЕНИТЬ И УДАЛИТЬ ИЗ КОДА): ${cleanText}`;
    saveMarkdownDirectly(lines.join('\n'), 'fix(spec): запрос на откат задачи');
}

const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

// Отправка новой идеи или вложенного комментария
async function processAndPush() {
    const openaiKey = localStorage.getItem('openai_key');
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const userIdea = document.getElementById('ideaText').value.trim();
    const fileInput = document.getElementById('mediaInput');

    if (!openaiKey || !githubToken || !repoName) return alert('Заполни ключи в настройках!');
    if (!userIdea && (!fileInput || !fileInput.files || !fileInput.files[0])) return alert('Введи текст или прикрепи фото!');

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    showLog('🚀 Обработка данных...');

    try {
        let imageUrlForMarkdown = '';

        if (fileInput && fileInput.files && fileInput.files[0]) {
            showLog('📷 Загрузка медиафайла...');
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

            if (ghRes.ok) imageUrlForMarkdown = `media/${fileName}`;
        }

        showLog('🤖 Анализ и интеграция ветки...');

        const targetContext = selectedParentTask 
            ? `ПОЛЬЗОВАТЕЛЬ ДОБАВЛЯЕТ ВЛОЖЕННЫЙ КОММЕНТАРИЙ/УТОЧНЕНИЕ К ЗАДАЧЕ: "${selectedParentTask.text}"`
            : `ПОЛЬЗОВАТЕЛЬ СОЗДАЕТ НОВУЮ ВЕРХНЕУРОВНЕВУЮ ИДЕЮ/ЭПИК.`;

        const systemPrompt = `Ты — Senior Technical Product Manager проекта VEI (LINK AI).

${targetContext}

ТВОЯ ЗАДАЧА: 
Ты — AI-архитектор проекта. Ниже представлен текущий Markdown-файл спецификации модуля и новая идея от разработчика.
Обнови файл спецификации: аккуратно добавь новую идею в виде чекбокса задачи (- [ ]) или обнови логику/Mermaid-схему, если требуется. Верни ТОЛЬКО итоговый обновленный текст Markdown файла целиком.

Проанализируй ввод пользователя не меняй контекст и не меняй нечего в самом тексте Это должна быть точно такая заметка как ее написал пользователь только исправь граматические ошибки если нужно и не разбивай задачи сам. просто твоя задача зафиксировать это в файле то что написал пользователь (текст + прикрепленное фото/скриншот).
Интегрируй этот ввод в существующий Markdown-файл:
- Если это ДОПОЛНЕНИЕ к существующей задаче: вставь новые вложенные подзадачи с отступом (2 или 4 пробела) сразу ПОСЛЕ родительской строки "${selectedParentTask ? selectedParentTask.text : ''}".
- Если это НОВАЯ идея: добавь ее в конец файла.
${imageUrlForMarkdown ? `- Обязательно вставь ссылку на медиафайл: ![Скриншот](${imageUrlForMarkdown})` : ''}

Возвращай ТОЛЬКО итоговый обновленный текст Markdown целиком. в

Текущий Markdown:
${currentMarkdownContent}`;

        const userContent = [{ type: 'text', text: userIdea || 'Добавление медиафайла к ветке.' }];
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const base64Img = await fileToBase64(fileInput.files[0]);
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:${fileInput.files[0].type};base64,${base64Img}` }
            });
        }

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

        await saveMarkdownDirectly(updatedMarkdown, `feat(spec): дополнить ветку идеей`);

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