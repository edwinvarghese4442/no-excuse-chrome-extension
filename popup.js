const STORAGE_KEY = 'reminders_v1';
const THEME_KEY = 'theme_preference';

/** @typedef {{id:string,title:string,when:number,enabled:boolean,completed:boolean,beepEnabled:boolean}} Reminder */

const editView = document.getElementById('view-edit');
const ul = document.getElementById('reminders');
const empty = document.getElementById('empty');
const form = document.getElementById('form');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');

// Theme toggle elements
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

// Edit modal elements
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editTitleInput = document.getElementById('editTitle');
const editDateInput = document.getElementById('editDate');
const editTimeInput = document.getElementById('editTime');
const editCancelBtn = document.getElementById('editCancel');
const editSoundToggle = document.getElementById('editSoundToggle');

// Modal elements
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancel = document.getElementById('confirmCancel');
const confirmDelete = document.getElementById('confirmDelete');

// Reminder modal elements
const reminderModal = document.getElementById('reminderModal');
const reminderMessage = document.getElementById('reminderMessage');
const reminderSnooze = document.getElementById('reminderSnooze');
const reminderDone = document.getElementById('reminderDone');

// Selection toolbar elements
const selectionActions = document.querySelector('.selection-actions');
const deleteSelectedBtn = document.getElementById('deleteSelected');

let reminderToDelete = null;
let reminderToEdit = null;
let currentReminder = null;

// Selection mode state
let selectionMode = false;
let selectedIds = new Set();

// Format title: first line <=18 chars, total <=35 chars; wrap at word boundary when possible
function escapeHtml(str){
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
function formatTitleForCard(rawTitle){
	const maxLine1 = 18;
	const maxTotal = 35;
	const s = (rawTitle || '').trim();
	if (!s) return '';
	let limited = s.length > maxTotal ? s.slice(0, maxTotal).trimEnd() : s;
	if (limited.length <= maxLine1) {
		return escapeHtml(limited);
	}
	// find last space at or before 18, else hard break at 18
	let breakIdx = limited.lastIndexOf(' ', maxLine1);
	if (breakIdx <= 0) breakIdx = maxLine1;
	const line1 = limited.slice(0, breakIdx).trimEnd();
	const line2 = limited.slice(breakIdx).trimStart();
	return `${escapeHtml(line1)}<br>${escapeHtml(line2)}`;
}

function enterSelectionMode(){
	selectionMode = true;
	// show toolbar container and actions
	document.querySelector('.selection-toolbar').hidden = false;
	selectionActions.hidden = false;
	selectedIds.clear();
	enableDeleteSelected(false);
	render();
}

function exitSelectionMode(){
	selectionMode = false;
	// hide toolbar container
	document.querySelector('.selection-toolbar').hidden = true;
	selectionActions.hidden = true;
	selectedIds.clear();
	enableDeleteSelected(false);
	render();
}

function enableDeleteSelected(enabled){
	deleteSelectedBtn.disabled = !enabled;
}





deleteSelectedBtn.addEventListener('click', async () => {
	if (!selectionMode || selectedIds.size === 0) return;
	// Show confirmation using existing modal
	reminderToDelete = null; // signal bulk
	confirmMessage.textContent = `Delete ${selectedIds.size} selected reminder(s)?`;
	confirmModal.classList.add('active');
});

// Theme management
async function loadTheme() {
	const { [THEME_KEY]: theme } = await chrome.storage.local.get(THEME_KEY);
	const currentTheme = theme || 'dark';
	document.documentElement.setAttribute('data-theme', currentTheme);
	updateThemeIcon(currentTheme);
}

async function toggleTheme() {
	const currentTheme = document.documentElement.getAttribute('data-theme');
	const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
	document.documentElement.setAttribute('data-theme', newTheme);
	updateThemeIcon(newTheme);
	await chrome.storage.local.set({ [THEME_KEY]: newTheme });
}

function updateThemeIcon(theme) {
	themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// Initialize form with current date/time
function initializeForm() {
	const now = new Date();
	now.setSeconds(0, 0);
	now.setMinutes(now.getMinutes() + 5 - (now.getMinutes() % 5));
	
	// Set minimum date to today
	const today = now.toISOString().slice(0, 10);
	dateInput.value = today;
	dateInput.min = today;
	timeInput.value = now.toTimeString().slice(0, 5);
	titleInput.focus();
}

// Add event listeners for quick action buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
	btn.addEventListener('click', (e) => {
		const minutes = parseInt(e.target.dataset.minutes);
		handleQuickAction(minutes);
	});
});

// Handle quick action button clicks
async function handleQuickAction(minutes) {
	const title = titleInput.value.trim().slice(0,35);
	if (!title) {
		titleInput.focus();
		return;
	}
	
	const now = new Date();
	const when = now.getTime() + (minutes * 60 * 1000);
	
	await createReminder(title, when, true);
	
	// Clear the form
	titleInput.value = '';
	initializeForm();
}

// Create reminder function
async function createReminder(title, when, beepEnabled = true) {
	const reminder = {
		id: crypto.randomUUID(),
		title: String(title || '').slice(0,35),
		when,
		enabled: true,
		completed: false,
		beepEnabled
	};
	
	const all = await getAll();
	all.push(reminder);
	await saveAll(all);
	await schedule(reminder);
	await render();
}

// Form submission
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const title = titleInput.value.trim().slice(0,35);
	if (!title) return;
	
	const date = dateInput.value;
	const time = timeInput.value;
	const when = new Date(`${date}T${time}`).getTime();
	
	if (when <= Date.now()) {
		alert('Please select a future date and time');
		return;
	}
	
	await createReminder(title, when, true);
	
	// Clear the form
	titleInput.value = '';
	initializeForm();
});

// Edit form submission
editForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const title = editTitleInput.value.trim().slice(0,35);
	if (!title) return;
	
	const date = editDateInput.value;
	const time = editTimeInput.value;
	const when = new Date(`${date}T${time}`).getTime();
	
	if (when <= Date.now()) {
		alert('Please select a future date and time');
		return;
	}
	
	if (reminderToEdit) {
		reminderToEdit.title = title.slice(0,35);
		reminderToEdit.when = when;
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === reminderToEdit.id);
		if (idx !== -1) {
			all[idx] = reminderToEdit;
			await saveAll(all);
			await cancelAlarm(reminderToEdit.id);
			await schedule(reminderToEdit);
		}
	}
	
	hideEditModal();
	await render();
});

// Edit cancel
editCancelBtn.addEventListener('click', () => {
	hideEditModal();
});

// Show edit modal
function showEditForm(reminder) {
	reminderToEdit = reminder;
	editTitleInput.value = reminder.title;
	editDateInput.value = new Date(reminder.when).toISOString().slice(0, 10);
	editTimeInput.value = new Date(reminder.when).toTimeString().slice(0, 5);
	
	// Set minimum date to today
	const today = new Date().toISOString().slice(0, 10);
	editDateInput.min = today;
	
	// sound toggle state
	if (editSoundToggle){
		editSoundToggle.classList.toggle('on', reminder.beepEnabled !== false);
		editSoundToggle.classList.toggle('off', reminder.beepEnabled === false);
		editSoundToggle.title = (reminder.beepEnabled !== false) ? 'Sound on. Click to mute' : 'Sound off. Click to unmute';
	}
	
	editModal.classList.add('active');
	editTitleInput.focus();
}

if (editSoundToggle){
	editSoundToggle.addEventListener('click', (e) => {
		e.preventDefault();
		if (!reminderToEdit) return;
		const next = !(reminderToEdit.beepEnabled !== false);
		reminderToEdit.beepEnabled = next;
		editSoundToggle.classList.toggle('on', next);
		editSoundToggle.classList.toggle('off', !next);
		editSoundToggle.title = next ? 'Sound on. Click to mute' : 'Sound off. Click to unmute';
	});
}

function hideEditModal() {
	editModal.classList.remove('active');
	reminderToEdit = null;
}

// Show list view
function showList() {
	editView.classList.remove('active');
	reminderToEdit = null;
}

// Create reminder card
function createCard(reminder) {
	const li = document.createElement('li');
	li.className = 'card';
	li.draggable = true;
	li.dataset.id = reminder.id;
	
	if (selectionMode) li.classList.add('selection-mode');
	
	const date = new Date(reminder.when);
	const dateStr = date.toLocaleDateString();
	const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	
	const soundOn = reminder.beepEnabled !== false;
	const soundTitle = soundOn ? 'Sound on. Click to mute' : 'Sound off. Click to unmute';
	const formattedTitle = formatTitleForCard(reminder.title);
	
	li.innerHTML = `
		<div class="drag-handle">⋮⋮</div>
		<div class="card-grid">
			<div class="card-left">
				${selectionMode ? `<input class="select-checkbox" type="checkbox" data-id="${reminder.id}" ${selectedIds.has(reminder.id) ? 'checked' : ''} />` : ''}
				<label class="complete-wrap">
					<input class="complete-checkbox" type="checkbox" ${reminder.completed ? 'checked' : ''} aria-label="Mark complete">
					<span class="checkmark"></span>
				</label>
			</div>
			<div class="card-center task-content" data-id="${reminder.id}">
				<div class="title">${formattedTitle}</div>
				<div class="meta">${dateStr} at ${timeStr}</div>
			</div>
			<div class="card-right">
				<button class="sound-toggle ${soundOn ? 'on' : 'off'}" title="${soundTitle}" aria-label="${soundTitle}"></button>
				<label class="toggle">
					<input class="toggle-input" type="checkbox" ${reminder.enabled ? 'checked' : ''} data-id="${reminder.id}">
					<span class="toggle-slider"></span>
				</label>
			</div>
		</div>
		<button class="delete-btn" data-id="${reminder.id}">×</button>
	`;
	
	// Preserve completed state
	if (reminder.completed) {
		li.classList.add('done');
	}
	
	// Selection checkbox handler
	if (selectionMode){
		const selectCb = li.querySelector('.select-checkbox');
		selectCb.addEventListener('change', () => {
			const id = selectCb.dataset.id;
			if (selectCb.checked) selectedIds.add(id); else selectedIds.delete(id);
			enableDeleteSelected(selectedIds.size > 0);
		});
	}

	// Event listeners
	const taskContent = li.querySelector('.task-content');
	taskContent.addEventListener('click', (e) => {
		// avoid opening edit when clicking controls or when in selection mode
		if (selectionMode) return;
		if ((e.target).closest('.complete-wrap') || (e.target).closest('.card-right') || e.target.closest('.delete-btn')) return;
		showEditForm(reminder);
	});

	const completeCb = li.querySelector('.complete-checkbox');
	completeCb.addEventListener('change', async (e) => {
		const checked = e.target.checked;
		reminder.completed = checked;
		reminder.enabled = checked ? false : reminder.enabled; // disable alarm when completed
		li.classList.toggle('done', checked);
		
		// if completed, turn off the alarm toggle visually
		const toggleInput = li.querySelector('input.toggle-input');
		if (checked && toggleInput){
			toggleInput.checked = false;
		}
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === reminder.id);
		if (idx !== -1) {
			all[idx] = reminder;
			await saveAll(all);
		}
		
		if (checked) {
			await cancelAlarm(reminder.id);
		} else {
			await schedule(reminder);
		}
	});

	const soundBtn = li.querySelector('.sound-toggle');
	soundBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		if (selectionMode) return;
		reminder.beepEnabled = reminder.beepEnabled === false ? true : false;
		soundBtn.classList.toggle('on', !!reminder.beepEnabled);
		soundBtn.classList.toggle('off', !reminder.beepEnabled);
		soundBtn.title = reminder.beepEnabled ? 'Sound on. Click to mute' : 'Sound off. Click to unmute';
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === reminder.id);
		if (idx !== -1) {
			all[idx] = reminder;
			await saveAll(all);
		}
	});

	const switchInput = li.querySelector('input.toggle-input');
	switchInput.addEventListener('change', async (e) => {
		if (selectionMode) { e.preventDefault(); switchInput.checked = !switchInput.checked; return; }
		const enabled = e.target.checked;
		reminder.enabled = enabled;
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === reminder.id);
		if (idx !== -1) {
			all[idx] = reminder;
			await saveAll(all);
		}
		
		if (enabled) {
			await schedule(reminder);
		} else {
			await cancelAlarm(reminder.id);
		}
	});

	const deleteBtn = li.querySelector('.delete-btn');
	let holdTimer = null;
	let longPressed = false;
	const holdDurationMs = 500;
	const startHold = () => {
		longPressed = false;
		holdTimer = setTimeout(() => {
			longPressed = true;
			// enter selection mode and pre-select this card
			enterSelectionMode();
			selectedIds.add(reminder.id);
			render();
			enableDeleteSelected(true);
		}, holdDurationMs);
	};
	const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
	deleteBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); startHold(); });
	deleteBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); startHold(); }, { passive: true });
	['mouseup','mouseleave','touchend','touchcancel'].forEach(evt => {
		deleteBtn.addEventListener(evt, clearHold);
	});
	deleteBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (longPressed) { longPressed = false; return; }
		if (selectionMode) return;
		showDeleteConfirmation(reminder);
	});
	
	// Drag and drop
	li.addEventListener('dragstart', handleDragStart);
	li.addEventListener('dragover', handleDragOver);
	li.addEventListener('drop', handleDrop);
	li.addEventListener('dragend', handleDragEnd);
	
	return li;
}

// Delete confirmation
function showDeleteConfirmation(reminder) {
	reminderToDelete = reminder;
	confirmMessage.textContent = `Are you sure you want to delete "${reminder.title}"?`;
	confirmModal.classList.add('active');
}

function hideDeleteConfirmation() {
	confirmModal.classList.remove('active');
	reminderToDelete = null;
}

confirmCancel.addEventListener('click', hideDeleteConfirmation);

confirmDelete.addEventListener('click', async () => {
	if (reminderToDelete) {
		await deleteReminder(reminderToDelete.id);
		hideDeleteConfirmation();
	} else if (selectedIds.size > 0) {
		// bulk delete path (do not depend on selectionMode flag)
		const ids = Array.from(selectedIds);
		await deleteReminders(ids);
		hideDeleteConfirmation();
		exitSelectionMode();
	}
});

// Bulk deletion helper
async function deleteReminders(ids){
	const all = await getAll();
	const remaining = all.filter(r => !ids.includes(r.id));
	await saveAll(remaining);
	// cancel alarms for deleted
	await Promise.all(ids.map(id => cancelAlarm(id)));
	await render();
}

// Delete reminder
async function deleteReminder(id) {
	const all = await getAll();
	const filtered = all.filter(r => r.id !== id);
	await saveAll(filtered);
	await cancelAlarm(id);
	await render();
}

// Drag and drop handlers
let draggedElement = null;
let draggedIndex = -1;

function handleDragStart(e) {
	draggedElement = e.target;
	draggedIndex = Array.from(ul.children).indexOf(e.target);
	e.target.classList.add('dragging');
}

function handleDragOver(e) {
	e.preventDefault();
	const afterElement = getDragAfterElement(ul, e.clientY);
	const dragging = document.querySelector('.dragging');
	
	if (afterElement == null) {
		ul.appendChild(dragging);
	} else {
		ul.insertBefore(dragging, afterElement);
	}
}

function getDragAfterElement(container, y) {
	const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
	
	return draggableElements.reduce((closest, child) => {
		const box = child.getBoundingClientRect();
		const offset = y - box.top - box.height / 2;
		
		if (offset < 0 && offset > closest.offset) {
			return { offset: offset, element: child };
		} else {
			return closest;
		}
	}, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleDrop(e) {
	e.preventDefault();
}

function handleDragEnd(e) {
	e.target.classList.remove('dragging');
	
	const newIndex = Array.from(ul.children).indexOf(e.target);
	if (newIndex !== draggedIndex) {
		reorderReminders(draggedIndex, newIndex);
	}
	
	draggedElement = null;
	draggedIndex = -1;
}

async function reorderReminders(fromIndex, toIndex) {
	const all = await getAll();
	const [draggedReminder] = all.splice(fromIndex, 1);
	all.splice(toIndex, 0, draggedReminder);
	
	await saveAll(all);
	await render();
}

// Reminder alert modal
function showReminderAlert(reminder) {
	currentReminder = reminder;
	reminderMessage.textContent = reminder.title;
	reminderModal.classList.add('active');
}

function hideReminderAlert() {
	reminderModal.classList.remove('active');
	currentReminder = null;
}

reminderSnooze.addEventListener('click', async () => {
	if (currentReminder) {
		// Stop beep immediately
		await chrome.runtime.sendMessage({ type: 'STOP_ALARM' }).catch(() => {});
		
		// Snooze for 5 minutes
		const when = Date.now() + 5 * 60 * 1000;
		currentReminder.when = when;
		currentReminder.enabled = true;
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === currentReminder.id);
		if (idx !== -1) {
			all[idx] = currentReminder;
			await saveAll(all);
		}
		
		await schedule(currentReminder);
		hideReminderAlert();
	}
});

reminderDone.addEventListener('click', async () => {
	if (currentReminder) {
		// Stop beep immediately
		await chrome.runtime.sendMessage({ type: 'STOP_ALARM' }).catch(() => {});
		
		currentReminder.completed = true;
		currentReminder.enabled = false;
		
		const all = await getAll();
		const idx = all.findIndex(r => r.id === currentReminder.id);
		if (idx !== -1) {
			all[idx] = currentReminder;
			await saveAll(all);
		}
		
		await cancelAlarm(currentReminder.id);
		hideReminderAlert();
		await render();
	}
});

// Listen for reminder messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'SHOW_REMINDER') {
		showReminderAlert(message.reminder);
	}
});

// Storage functions
async function getAll() {
	const { [STORAGE_KEY]: val } = await chrome.storage.local.get(STORAGE_KEY);
	return Array.isArray(val) ? val : [];
}

async function saveAll(items) {
	await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

async function schedule(reminder) {
	if (!reminder.enabled || reminder.completed) return;
	if (reminder.when <= Date.now()) return;
	await chrome.alarms.create(`reminder:${reminder.id}`, { when: reminder.when });
}

async function cancelAlarm(id) {
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
	// update action state after render
	if (selectionMode){
		enableDeleteSelected(selectedIds.size > 0);
	}
}

// Theme toggle event listener
themeToggle.addEventListener('click', toggleTheme);

// Click-outside to exit selection mode
document.addEventListener('mousedown', (e) => {
	if (!selectionMode) return;
	// ignore when any modal is open
	if (document.querySelector('.modal-overlay.active')) return;
	const toolbar = document.querySelector('.selection-toolbar');
	const isInsideToolbar = toolbar && toolbar.contains(e.target);
	const isInsideCard = (e.target).closest && (e.target).closest('.card');
	if (!isInsideToolbar && !isInsideCard) {
		exitSelectionMode();
	}
});

// Initialize everything
async function initialize() {
	await loadTheme();
	await render();
	initializeForm();
}

// Start the app
initialize();
