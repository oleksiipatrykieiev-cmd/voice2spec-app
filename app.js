let currentMarkdownLines = [];
let currentFileSha = null;
let branches = JSON.parse(localStorage.getItem('app_branches')) || [];
let selectedParentTask = null;
let activeModalLineIndex = null;
let sortableInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('geminiKey').value = localStorage.getItem('openai_key') || '';
    document.getElementById('githubToken').value = localStorage.getItem('github_token') || '';
    document.getElementById('repoName').value = localStorage.getItem('repo_name') || '';
    renderBranches();
    if (branches.length > 0) loadTasksFromGithub();
});

function toggleSettings() { document.getElementById('settings').classList.toggle('hidden'); }

function showLoading(text = 'Синхронизация с GitHub...') {
    document.getElementById('overlayText').innerText = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
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

function showLog(msg) { document.getElementById('statusLog').innerText = msg; }

async function loadTasksFromGithub() {
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;
    const tasksList = document.getElementById('tasksList');

    if (!githubToken || !repoName || !filePath) return;
    showLoading('Загрузка задач из репозитория...');

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
    } finally {
        hideLoading();
    }
}

function renderTreeList() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';
    document.getElementById('saveOrderBar').classList.add('hidden');

    const filterNew = document.getElementById('f_new').checked;
    const filterWip = document.getElementById('f_wip').checked;
    const filterDone = document.getElementById('f_done').checked;
    const filterDel = document.getElementById('f_del').checked;
    const filterPri = document.getElementById('f_pri').value;

    let hasTasks = false;

    currentMarkdownLines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [') || trimmed.startsWith('* [') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            
            const isDone = line.includes('[x]');
            const isDeleted = line.includes('~~');
            const isWip = line.includes('[🛠️]');
            const isNew = !isDone && !isDeleted && !isWip;

            const hasMedia = /!\[.*?\]\(.*?\)/.test(line);
            const isPinned = line.includes('[📌]');
            let priority = '⚪';
            if (line.includes('[P:🔴]')) priority = '🔴';
            if (line.includes('[P:🟡]')) priority = '🟡';

            if (!filterNew && isNew) return;
            if (!filterWip && isWip) return;
            if (!filterDone && isDone && !isDeleted) return;
            if (!filterDel && isDeleted) return;
            if (filterPri !== 'all' && priority !== filterPri) return;

            hasTasks = true;

            const indentSpaces = line.search(/\S/);
            const indentLevel = Math.floor(indentSpaces / 2);

            let cleanText = line.replace(/^[\s-*]+(\[[ x]\])?\s*/, '')
                                .replace(/\[📌\]/g, '')
                                .replace(/\[P:[🔴🟡⚪]\]/g, '')
                                .replace(/\[🛠️\]/g, '')
                                .replace(/!\[.*?\]\(.*?\)/g, '')
                                .replace(/~~/g, '')
                                .trim();

            const wrapper = document.createElement('div');
            wrapper.className = `swipe-wrap rounded-xl border my-1 bg-slate-800 ${isPinned ? 'border-amber-400 ring-1 ring-amber-400/30' : (isDone ? 'border-slate-800 bg-slate-900' : 'border-slate-700')}`;
            wrapper.style.marginLeft = `${indentLevel * 14}px`;
            wrapper.dataset.index = index;

            const actionLeft = document.createElement('div');
            actionLeft.className = 'swipe-action-left';
            actionLeft.innerHTML = 'Удалить';
            actionLeft.onclick = () => confirmDeleteBranch(index);

            const actionRight = document.createElement('div');
            actionRight.className = 'swipe-action-right';
            actionRight.innerHTML = 'Меню ⚙️';
            actionRight.onclick = () => openCardModal(index);

            const card = document.createElement('div');
            card.className = `swipe-content flex items-center justify-between p-3 bg-slate-800 rounded-xl text-xs touch-pan-y ${isDone || isDeleted ? 'text-slate-500 line-through bg-slate-900' : 'text-slate-100'}`;

            const treeBranchIcon = indentLevel > 0 ? '<span class="text-indigo-400/80 font-bold mr-1">└─</span>' : '';

            card.innerHTML = `
                <div class="flex items-center gap-2 flex-1 min-w-0 pr-1 drag-handle select-none">
                    ${treeBranchIcon}
                    <button onclick="openCardModal(${index})" class="text-xs cursor-pointer shrink-0">${priority}</button>
                    ${isPinned ? '<span class="text-amber-400 text-xs shrink-0" title="Закреплено">📌</span>' : ''}
                    ${isWip ? '<span class="text-amber-400 text-[10px] font-bold bg-amber-950 px-1.5 py-0.5 rounded border border-amber-600/40 shrink-0">В работе 🛠️</span>' : ''}
                    <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTaskDone(${index})" class="rounded border-slate-700 text-indigo-600 focus:ring-0 shrink-0">
                    <span class="break-all font-sans text-xs leading-snug flex-1">${cleanText}</span>
                    ${hasMedia ? '<span class="text-slate-400 shrink-0 ml-1">📎</span>' : ''}
                </div>
                <button onclick="openCardModal(${index})" class="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 shrink-0 ml-1" title="Настройки">⚙️</button>
            `;

            wrapper.appendChild(actionLeft);
            wrapper.appendChild(actionRight);
            wrapper.appendChild(card);
            tasksList.appendChild(wrapper);

            let startX = 0, currentX = 0;
            card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
            card.addEventListener('touchmove', e => {
                currentX = e.touches[0].clientX;
                let diff = currentX - startX;
                if (Math.abs(diff) < 120) card.style.transform = `translateX(${diff}px)`;
            }, {passive: true});
            card.addEventListener('touchend', e => {
                let diff = currentX - startX;
                if (diff < -60) {
                    card.style.transform = `translateX(-90px)`;
                    setTimeout(() => { if (wrapper.parentElement) card.style.transform = `translateX(0)`; }, 3500);
                } else if (diff > 60) {
                    card.style.transform = `translateX(90px)`;
                    setTimeout(() => { openCardModal(index); card.style.transform = `translateX(0)`; }, 200);
                } else {
                    card.style.transform = `translateX(0)`;
                }
            });
        }
    });

    if (!hasTasks) tasksList.innerHTML = '<div class="text-xs text-slate-500 text-center py-4">Задач пока нет</div>';

    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(tasksList, {
        animation: 150,
        handle: '.drag-handle',
        delay: 150,
        delayOnTouchOnly: true,
        onEnd: function (evt) {
            applyDOMReorder(evt.oldIndex, evt.newIndex);
        }
    });
}

function openCardModal(lineIndex) {
    activeModalLineIndex = lineIndex;
    document.getElementById('cardModal').classList.remove('hidden');
}

function closeCardModal() {
    activeModalLineIndex = null;
    document.getElementById('cardModal').classList.add('hidden');
}

function setCardStatus(status) {
    if (activeModalLineIndex === null) return;
    let line = currentMarkdownLines[activeModalLineIndex];

    line = line.replace('[🛠️]', '').replace('[x]', '[ ]');
    if (status === 'wip') line = line.replace('- [ ]', '- [ ] [🛠️]');
    if (status === 'done') {
        line = line.replace('- [ ]', '- [x]');
        moveToBottom(activeModalLineIndex);
        closeCardModal();
        return;
    }

    currentMarkdownLines[activeModalLineIndex] = line;
    closeCardModal();
    saveMarkdownDirectly('fix(spec): изменен статус задачи');
}

function setCardPriority(priority) {
    if (activeModalLineIndex === null) return;
    let line = currentMarkdownLines[activeModalLineIndex];
    line = line.replace(/\[P:[🔴🟡⚪]\]/g, '').trim();
    line += ` [P:${priority}]`;
    currentMarkdownLines[activeModalLineIndex] = line;
    closeCardModal();
    saveMarkdownDirectly('fix(spec): изменен приоритет');
}

function modalTogglePin() {
    if (activeModalLineIndex === null) return;
    let line = currentMarkdownLines[activeModalLineIndex];
    if (line.includes('[📌]')) {
        currentMarkdownLines[activeModalLineIndex] = line.replace(' [📌]', '').replace('[📌]', '');
        closeCardModal();
        saveMarkdownDirectly('fix(spec): открепление задачи');
    } else {
        currentMarkdownLines[activeModalLineIndex] = line + ' [📌]';
        closeCardModal();
        moveToTop(activeModalLineIndex);
    }
}

function modalAddComment() {
    if (activeModalLineIndex === null) return;
    const cleanText = currentMarkdownLines[activeModalLineIndex].replace(/^[\s-*]+(\[[ x]\])?\s*/, '').replace(/\[📌\]/g, '').replace(/\[P:[🔴🟡⚪]\]/g, '').trim();
    setReplyTarget(activeModalLineIndex, cleanText);
    closeCardModal();
}

function modalDeleteBranch() {
    if (activeModalLineIndex === null) return;
    confirmDeleteBranch(activeModalLineIndex);
    closeCardModal();
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

function toggleTaskDone(lineIndex) {
    let line = currentMarkdownLines[lineIndex];
    if (line.includes('- [ ]')) {
        currentMarkdownLines[lineIndex] = line.replace('- [ ]', '- [x]').replace('[🛠️]', '');
        moveToBottom(lineIndex);
    } else {
        currentMarkdownLines[lineIndex] = line.replace('- [x]', '- [ ]');
        saveMarkdownDirectly('fix(spec): снята отметка выполнения');
    }
}

function confirmDeleteBranch(lineIndex) {
    if (!confirm('Точно удалить эту идею и все ее вложенные комментарии?')) return;

    const parentIndent = currentMarkdownLines[lineIndex].search(/\S/);
    let countToDelete = 1;

    for (let i = lineIndex + 1; i < currentMarkdownLines.length; i++) {
        const currentIndent = currentMarkdownLines[i].search(/\S/);
        if (currentIndent > parentIndent) {
            countToDelete++;
        } else {
            break;
        }
    }

    currentMarkdownLines.splice(lineIndex, countToDelete);
    saveMarkdownDirectly('fix(spec): удаление ветки задач');
}

function moveToTop(lineIndex) {
    const line = currentMarkdownLines.splice(lineIndex, 1)[0];
    const headerIndex = currentMarkdownLines.findIndex(l => l.includes('## Задачи'));
    const insertAt = headerIndex !== -1 ? headerIndex + 1 : 0;
    currentMarkdownLines.splice(insertAt, 0, line);
    saveMarkdownDirectly('fix(spec): закрепление задачи наверх');
}

function moveToBottom(lineIndex) {
    const line = currentMarkdownLines.splice(lineIndex, 1)[0];
    currentMarkdownLines.push(line);
    saveMarkdownDirectly('fix(spec): перемещение выполненного вниз');
}

function applyDOMReorder(oldDOMIndex, newDOMIndex) {
    const items = document.querySelectorAll('.swipe-wrap');
    if (items.length === 0) return;

    const oldLineIndex = parseInt(items[newDOMIndex].dataset.index);
    let targetLineIndex = parseInt(items[oldDOMIndex].dataset.index);

    if (oldLineIndex !== targetLineIndex) {
        const line = currentMarkdownLines.splice(oldLineIndex, 1)[0];
        currentMarkdownLines.splice(targetLineIndex, 0, line);
        document.getElementById('saveOrderBar').classList.remove('hidden');
    }
}

function saveReorderedMarkdown() {
    saveMarkdownDirectly('fix(spec): сохранение ручного порядка задач');
}

async function saveMarkdownDirectly(commitMsg) {
    const githubToken = localStorage.getItem('github_token');
    const repoName = localStorage.getItem('repo_name');
    const filePath = document.getElementById('moduleSelect').value;

    showLoading('Сохранение изменений на GitHub...');
    const newMarkdown = currentMarkdownLines.join('\n');

    try {
        const ghUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
        const putBody = { message: commitMsg, content: btoa(unescape(encodeURIComponent(newMarkdown))), branch: 'main' };
        if (currentFileSha) putBody.sha = currentFileSha;

        const res = await fetch(ghUrl, { method: 'PUT', headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(putBody) });
        if (res.ok) {
            showLog('✅ Успешно сохранено!');
            cancelReply();
            await loadTasksFromGithub();
        }
    } catch (e) {
        showLog('❌ Ошибка сохранения: ' + e.message);
    } finally {
        hideLoading();
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
    showLoading('ИИ структурирует задачу...');

    try {
        let imageUrlForMarkdown = '';

        if (fileInput && fileInput.files && fileInput.files[0]) {
            showLoading('Загрузка медиафайла в репозиторий...');
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

        const targetContext = selectedParentTask 
            ? `ПОЛЬЗОВАТЕЛЬ ДОБАВЛЯЕТ ВЛОЖЕННЫЙ КОММЕНТАРИЙ/УТОЧНЕНИЕ К ЗАДАЧЕ: "${selectedParentTask.text}"`
            : `ПОЛЬЗОВАТЕЛЬ СОЗДАЕТ НОВУЮ ВЕРХНЕУРОВНЕВУЮ ИДЕЮ/ЭПИК.`;

        const systemPrompt = `Ты — AI-архитектор проекта. Ниже представлен текущий Markdown-файл спецификации.

${targetContext}

ТВОЯ ЗАДАЧА:
Интегрируй этот ввод в существующий Markdown-файл.
- Если это ДОПОЛНЕНИЕ к существующей задаче: вставь новые вложенные пункты с отступом в 2 пробела строго ПОСЛЕ родительской строки "${selectedParentTask ? selectedParentTask.text : ''}".
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
        await saveMarkdownDirectly(`feat(spec): добавление идеи`);

        document.getElementById('ideaText').value = '';
        if (fileInput) {
            fileInput.value = '';
            document.getElementById('fileNameDisplay').innerText = 'Прикрепить фото/скриншот';
        }

    } catch (e) {
        showLog('❌ Ошибка: ' + e.message);
    } finally {
        sendBtn.disabled = false;
        hideLoading();
    }
}