const STORAGE_KEY = 'reminders_v1';

/** @typedef {{id:string,title:string,when:number,enabled:boolean,completed:boolean}} Reminder */

const listView = document.getElementById('view-list');
const formView = document.getElementById('view-form');
const ul = document.getElementById('reminders');
const empty = document.getElementById('empty');
const addBtn = document.getElementById('addBtn');
const form = document.getElementById('form');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const cancelBtn = document.getElementById('cancel');

addBtn.addEventListener('click', () => {
	showForm();
});

cancelBtn.addEventListener('click', () => {
	showList();
});

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const title = titleInput.value.trim();
	if (!title) return;
	const when = parseInputsToEpoch(dateInput.value, timeInput.value);
	const reminder = { id: crypto.randomUUID(), title, when, enabled: true, completed: false };
	const all = await getAll();
	all.unshift(reminder);
	await saveAll(all);
	await schedule(reminder);
	titleInput.value = '';
	showList();
	await render();
});

function showForm(){
	listView.classList.remove('active');
	formView.classList.add('active');
	// prefill date/time to the next 5 minutes
	const now = new Date();
	now.setSeconds(0,0);
	now.setMinutes(now.getMinutes()+5 - (now.getMinutes()%5));
	dateInput.value = now.toISOString().slice(0,10);
	timeInput.value = now.toTimeString().slice(0,5);
	setTimeout(() => titleInput.focus(), 50);
}

function showList(){
	formView.classList.remove('active');
	listView.classList.add('active');
}

async function getAll(){
	const { [STORAGE_KEY]: val } = await chrome.storage.local.get(STORAGE_KEY);
	return Array.isArray(val) ? val : [];
}

async function saveAll(items){
	await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

function parseInputsToEpoch(dateStr, timeStr){
	const [y,m,d] = dateStr.split('-').map(Number);
	const [hh,mm] = timeStr.split(':').map(Number);
	return new Date(y, m-1, d, hh, mm, 0, 0).getTime();
}

function formatWhen(ts){
	const d = new Date(ts);
	return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function createCard(reminder){
	const li = document.createElement('li');
	li.className = 'card' + (reminder.completed ? ' done' : '');

	const handle = document.createElement('div');
	handle.className = 'drag-handle';
	handle.textContent = '≡';
	li.appendChild(handle);

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.className = 'checkbox';
	checkbox.checked = reminder.completed;
	checkbox.addEventListener('change', async () => {
		reminder.completed = checkbox.checked;
		if (reminder.completed) reminder.enabled = false;
		await saveUpdate(reminder);
		await cancelAlarm(reminder.id);
		await render();
	});
	li.appendChild(checkbox);

	const content = document.createElement('div');
	content.style.display = 'flex';
	content.style.flexDirection = 'column';
	content.style.gap = '2px';

	const title = document.createElement('div');
	title.className = 'title';
	title.textContent = reminder.title;
	content.appendChild(title);

	const meta = document.createElement('div');
	meta.className = 'meta';
	meta.textContent = formatWhen(reminder.when);
	content.appendChild(meta);

	li.appendChild(content);

	const spacer = document.createElement('div');
	spacer.className = 'spacer';
	li.appendChild(spacer);

	const toggle = document.createElement('input');
	toggle.type = 'checkbox';
	toggle.className = 'switch';
	toggle.checked = reminder.enabled;
	toggle.addEventListener('change', async () => {
		reminder.enabled = toggle.checked;
		if (reminder.enabled && !reminder.completed) {
			await schedule(reminder);
		} else {
			await cancelAlarm(reminder.id);
		}
		await saveUpdate(reminder);
		await render();
	});
	li.appendChild(toggle);

	return li;
}

async function saveUpdate(updated){
	const all = await getAll();
	const idx = all.findIndex(r => r.id === updated.id);
	if (idx !== -1) {
		all[idx] = updated;
		await saveAll(all);
	}
}

async function schedule(reminder){
	if (!reminder.enabled || reminder.completed) return;
	if (reminder.when <= Date.now()) return;
	await chrome.alarms.create(`reminder:${reminder.id}`, { when: reminder.when });
}

async function cancelAlarm(id){
	await chrome.alarms.clear(`reminder:${id}`);
}

async function render(){
	const items = await getAll();
	ul.innerHTML = '';
	if (!items.length) {
		empty.style.display = 'block';
	} else {
		empty.style.display = 'none';
	}
	for (const it of items){
		ul.appendChild(createCard(it));
	}
}

await render(); 