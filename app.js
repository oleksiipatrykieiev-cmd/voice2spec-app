let currentMarkdownLines = [];
let currentFileSha = null;
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];
let selectedParentTask = null;
let sortableInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('geminiKey').value = localStorage.getItem('openai_key') || '';
    document.getElementById('githubToken').value = localStorage.getItem('github_token') || '';
    document.getElementById('repoName').value = localStorage.getItem('repo_name') || '';
    renderBranches();
    if (branches.length > 0) loadTasksFromGithub();
});

function toggleSettings() { document.getElementById('settings').classList.toggle('hidden'); }

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

function showLog(msg) { document.getElementById('statusLog').innerText = msg; }

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
            currentMarkdownLines = decodeURIComponent(escape(atob(data.content))).split('\n');
            renderTreeList();
        } else {
            currentMarkdownLines = ['# Архитектура модуля', '', '## Задачи', ''];
            currentFileSha = null;
            renderTreeList();
        }
    } catch (e) {
        showLog('❌ Ошибка загрузки задач: ' + e.message);
    }
}

function renderTreeList() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';

    const filterNew = document.getElementById('f_new').checked;
    const filterDone = document.getElementById('f_done').checked;
    const filterDel = document.getElementById('f_del').checked;
    const filterPri = document.getElementById('f_pri').value;

    let hasTasks = false;

    currentMarkdownLines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [') || trimmed.startsWith('* [') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            
            const isDone = line.includes('[x]');
            const isDeleted = line.includes('~~');
            const isNew = !isDone && !isDeleted;

            // Извлечение тегов
            const hasMedia = /!\[.*?\]\(.*?\)/.test(line);
            const isPinned = line.includes('[📌]');
            let priority = '⚪'; // Обычный по умолчанию
            if (line.includes('[P:🔴]')) priority = '🔴';
            if (line.includes('[P:🟡]')) priority = '🟡';

            // Применение фильтров
            if (!filterNew && isNew) return;
            if (!filterDone && isDone && !isDeleted) return;
            if (!filterDel && isDeleted) return;
            if (filterPri !== 'all' && priority !== filterPri) return;

            hasTasks = true;

            const indentSpaces = line.search(/\S/);
            const indentLevel = Math.floor(indentSpaces / 2);
            
            // Очистка текста от служебных символов для рендера
            let cleanText = line.replace(/^[\s-*]+(\[[ x]\])?\s*/, '')
                                .replace(/\[📌\]/g, '')
                                .replace(/\[P:[🔴🟡⚪]\]/g, '')
                                .replace(/!\[.*?\]\(.*?\)/g, '')
                                .replace(/~~/g, '')
                                .trim();

            // Создание карточки (Swipe Wrapper)
            const wrapper = document.createElement('div');
            wrapper.className = `swipe-wrap rounded-xl border my-1 cursor-pointer 
                ${isDeleted ? 'opacity-50' : ''} 
                ${isPinned ? 'border-amber-500/50 bg-slate-800' : (isDone ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-800/80 border-slate-700/80')}`;
            wrapper.style.marginLeft = `${indentLevel * 12}px`;
            wrapper.dataset.index = index;

            const actionBtn = document.createElement('div');
            actionBtn.className = 'swipe-action';
            actionBtn.innerHTML = 'Удалить?';
            actionBtn.onclick = () => confirmDeleteTask(index);

            const card = document.createElement('div');
            card.className = `swipe-content flex items-center justify-between p-2.5 rounded-xl text-xs touch-pan-y ${isDone || isDeleted ? 'text-slate-500' : 'text-slate-200'}`;
            if (isDone || isDeleted) card.classList.add('line-through');

            card.innerHTML = `
                <div class="flex items-center gap-2 flex-1 min-w-0 pr-2 drag-handle select-none">
                    <button onclick="cyclePriority(${index})" class="text-sm cursor-pointer shrink-0">${priority}</button>
                    ${isPinned ? '<span class="text-amber-400 shrink-0">📌</span>' : ''}
                    ${line.includes('[ ]') || line.includes('[x]') ? `<input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTaskDone(${index})" class="rounded border-slate-700 text-indigo-600 focus:ring-0 shrink-0">` : '<span class="text-indigo-400 shrink-0">🔹</span>'}
                    <span class="break-all font-mono text-[11px] leading-tight flex-1">${cleanText}</span>
                    ${hasMedia ? '<span class="text-slate-400 shrink-0 ml-1">📎</span>' : ''}
                </div>
                <div class="flex gap-1 shrink-0 bg-slate-800/80 rounded p-0.5">
                    <button onclick="togglePin(${index})" class="p-1 hover:bg-slate-700 rounded ${isPinned ? 'text-amber-400' : 'text-slate-500'}" title="Закрепить">📌</button>
                    <button onclick="setReplyTarget(${index}, '${cleanText.replace(/'/g, "\\'")}')" class="p-1 hover:bg-indigo-900/50 rounded text-indigo-300" title="Добавить комментарий">💬</button>
                </div>
            `;

            wrapper.appendChild(actionBtn);
            wrapper.appendChild(card);
            tasksList.appendChild(wrapper);

            // Логика Swipe to Delete
            let startX = 0, currentX = 0;
            card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
            card.addEventListener('touchmove', e => {
                currentX = e.touches[0].clientX;
                let diff = currentX - startX;
                if (diff > 0 && diff < 100) card.style.transform = `translateX(${diff}px)`;
            }, {passive: true});
            card.addEventListener('touchend', e => {
                let diff = currentX - startX;
                if (diff > 50) {
                    card.style.transform = `translateX(80px)`; // Открыто
                    setTimeout(() => { if(wrapper.parentElement) card.style.transform = `translateX(0)`; }, 3000);
                } else {
                    card.style.transform = `translateX(0)`; // Возврат
                }
            });
        }
    });

    if (!hasTasks) tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">Задач пока нет</div>';

    // Инициализация Drag and Drop
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(tasksList, {
        animation: 150,
        handle: '.drag-handle',
        delay: 200,
        delayOnTouchOnly: true,
        onEnd: function (evt) {
            reorderMarkdown(evt.oldIndex, evt.newIndex);
        }
    });
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

// Управление тегами и статусами в строке Markdown
function cyclePriority(lineIndex) {
    let line = currentMarkdownLines[lineIndex];
    if(line.includes('[P:🔴]')) line = line.replace('[P:🔴]', '[P:🟡]');
    else if(line.includes('[P:🟡]')) line = line.replace('[P:🟡]', '[P:⚪]');
    else if(line.includes('[P:⚪]')) line = line.replace('[P:⚪]', '[P:🔴]');
    else line += ' [P:🔴]';
    currentMarkdownLines[lineIndex] = line;
    saveMarkdownDirectly('fix(spec): изменен приоритет');
}

function togglePin(lineIndex) {
    let line = currentMarkdownLines[lineIndex];
    if(line.includes('[📌]')) {
        currentMarkdownLines[lineIndex] = line.replace(' [📌]', '').replace('[📌]', '');
    } else {
        currentMarkdownLines[lineIndex] = line + ' [📌]';
        // Перенос закрепленной в самый верх задач
        moveToTop(lineIndex);
        return; 
    }
    saveMarkdownDirectly('fix(spec): изменен статус закрепления');
}

function toggleTaskDone(lineIndex) {
    let line = currentMarkdownLines[lineIndex];
    if (line.includes('- [ ]')) {
        currentMarkdownLines[lineIndex] = line.replace('- [ ]', '- [x]');
        moveToBottom(lineIndex); // Выполненные вниз
        return;
    } else {
        currentMarkdownLines[lineIndex] = line.replace('- [x]', '- [ ]');
    }
    saveMarkdownDirectly('fix(spec): переключить статус задачи');
}

function confirmDeleteTask(lineIndex) {
    let line = currentMarkdownLines[lineIndex];
    // Оборачиваем текст задачи в ~~ для зачеркивания
    if(!line.includes('~~')) {
        const textMatch = line.match(/^([\s-*]+(?:\[[ x]\])?\s*)(.*)$/);
        if(textMatch) {
            currentMarkdownLines[lineIndex] = `${textMatch[1]}~~${textMatch[2]}~~`;
        }
    }
    moveToBottom(lineIndex); // Удаленные отправляем вниз
}

function moveToTop(lineIndex) {
    const line = currentMarkdownLines.splice(lineIndex, 1)[0];
    const headerIndex = currentMarkdownLines.findIndex(l => l.includes('## Задачи'));
    const insertAt = headerIndex !== -1 ? headerIndex + 1 : 0;
    currentMarkdownLines.splice(insertAt, 0, line);
    saveMarkdownDirectly('fix(spec): закрепление задачи');
}

function moveToBottom(lineIndex) {
    const line = currentMarkdownLines.splice(lineIndex, 1)[0];
    currentMarkdownLines.push(line);
    saveMarkdownDirectly('fix(spec): обновление статуса');
}

function reorderMarkdown(oldDOMIndex, newDOMIndex) {
    const items = document.querySelectorAll('.swipe-wrap');
    if (items.length === 0) return;

    const oldLineIndex = parseInt(items[newDOMIndex].dataset.index);
    let targetLineIndex = null;
    
    // Определяем куда вставлять в массиве строк (относительно соседей)
    if (newDOMIndex > 0) {
        targetLineIndex = parseInt(items[newDOMIndex - 1].dataset.index) + (oldDOMIndex < newDOMIndex ? 0 : 1);
    } else {
        targetLineIndex = parseInt(items[1].dataset.index) - (oldDOMIndex > newDOMIndex ? 0 : 1);
    }

    if(targetLineIndex !== null && oldLineIndex !== targetLineIndex) {
        const line = currentMarkdownLines.splice(oldLineIndex, 1)[0];
        // Корректировка индекса после удаления элемента
        if (targetLineIndex > oldLineIndex) targetLineIndex--;
        currentMarkdownLines.splice(targetLineIndex, 0, line);
        saveMarkdownDirectly('fix(spec): сортировка задач');
    }
}

async function saveMarkdownDirectly(commitMsg) {
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;

    showLog('🚀 Обновление файла...');
    const newMarkdown = currentMarkdownLines.join('\n');

    try {
        const ghUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
        const putBody = { message: commitMsg, content: btoa(unescape(encodeURIComponent(newMarkdown))), branch: 'main' };
        if (currentFileSha) putBody.sha = currentFileSha;

        const res = await fetch(ghUrl, { method: 'PUT', headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(putBody) });
        if (res.ok) {
            showLog('✅ Сохранено!');
            cancelReply();
            await loadTasksFromGithub();
        }
    } catch (e) {
        showLog('❌ Ошибка сохранения: ' + e.message);
    }
}

const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

async function processAndPush() {
    const openaiKey = localStorage.getItem('openai_key');
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
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
                body: JSON.stringify({ message: `upload media ${fileName}`, content: base64Content, branch: 'main' })
            });

            if (ghRes.ok) imageUrlForMarkdown = `media/${fileName}`;
        }

        showLog('🤖 Интеграция ветки...');

        const targetContext = selectedParentTask 
            ? `ПОЛЬЗОВАТЕЛЬ ДОБАВЛЯЕТ ВЛОЖЕННЫЙ КОММЕНТАРИЙ/УТОЧНЕНИЕ К ЗАДАЧЕ: "${selectedParentTask.text}"`
            : `ПОЛЬЗОВАТЕЛЬ СОЗДАЕТ НОВУЮ ВЕРХНЕУРОВНЕВУЮ ИДЕЮ/ЭПИК.`;

        const systemPrompt = `Ты — AI-архитектор проекта. Ниже представлен текущий Markdown-файл спецификации.

${targetContext}

ТВОЯ ЗАДАЧА:
Интегрируй этот ввод (идею пользователя) в существующий Markdown-файл. Не меняй контекст остальных задач.
- Если это ДОПОЛНЕНИЕ: вставь новые вложенные пункты с отступом (2 пробела) сразу ПОСЛЕ родительской строки "${selectedParentTask ? selectedParentTask.text : ''}".
- Если это НОВАЯ идея: добавь ее СРАЗУ ПОСЛЕ заголовка "## Задачи" (в самый верх списка задач).
- Формат новой идеи: - [ ] Текст идеи [P:⚪]
${imageUrlForMarkdown ? `- Обязательно добавь ссылку на файл: ![Скриншот](${imageUrlForMarkdown})` : ''}

Возвращай ТОЛЬКО итоговый обновленный текст Markdown целиком.

Текущий Markdown:
${currentMarkdownLines.join('\n')}`;

        const userContent = [{ type: 'text', text: userIdea || 'Добавление медиафайла к ветке.' }];
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const base64Img = await fileToBase64(fileInput.files[0]);
            userContent.push({ type: 'image_url', image_url: { url: `data:${fileInput.files[0].type};base64,${base64Img}` } });
        }

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }] })
        });

        const aiData = await aiRes.json();
        const updatedMarkdown = aiData.choices[0].message.content.replace(/^```markdown\n?/, '').replace(/\n?```$/, '');

        currentMarkdownLines = updatedMarkdown.split('\n');
        await saveMarkdownDirectly(`feat(spec): дополнение ветки идей`);

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