const STORAGE_KEY = 'reminders_v1';

// Get DOM elements
const reminderMessage = document.getElementById('reminderMessage');
const reminderSnooze = document.getElementById('reminderSnooze');
const reminderDone = document.getElementById('reminderDone');
const notificationContainer = document.querySelector('.notification-container');

let currentReminder = null;

// Initialize the notification
async function initializeNotification() {
	try {
		// Get the reminder data from storage
		const { current_reminder } = await chrome.storage.local.get('current_reminder');
		if (current_reminder) {
			currentReminder = current_reminder;
			reminderMessage.textContent = current_reminder.title;
		}
		// start subtle vibration (respecting reduced motion via CSS)
		notificationContainer.classList.add('vibrating');
	} catch (e) {
		console.error('Failed to load reminder data:', e);
	}
}

function stopVibration(){
	if (notificationContainer){
		notificationContainer.classList.remove('vibrating');
	}
}

// Helper functions
async function getAll() {
	const { [STORAGE_KEY]: val } = await chrome.storage.local.get(STORAGE_KEY);
	return Array.isArray(val) ? val : [];
}

async function saveAll(items) {
	await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

async function saveUpdate(updated) {
	const all = await getAll();
	const idx = all.findIndex(r => r.id === updated.id);
	if (idx !== -1) {
		all[idx] = updated;
		await saveAll(all);
	}
}

async function schedule(reminder) {
	if (!reminder || !reminder.enabled || reminder.completed) return;
	if (!Number.isFinite(reminder.when)) return;
	if (reminder.when <= Date.now()) return;
	await chrome.alarms.create(`reminder:${reminder.id}`, { when: reminder.when });
}

async function cancelAlarm(id) {
	await chrome.alarms.clear(`reminder:${id}`);
}

// Stop the beep immediately
async function stopBeep() {
	try {
		await chrome.runtime.sendMessage({ type: 'STOP_ALARM' });
	} catch (e) {
		console.error('Failed to stop alarm:', e);
	}
}

// Close the current tab
async function closeTab() {
	try {
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tabs[0]) {
			await chrome.tabs.remove(tabs[0].id);
		}
	} catch (e) {
		console.error('Failed to close tab:', e);
		// Fallback: try to close window
		try {
			await chrome.windows.getCurrent();
			window.close();
		} catch (e2) {
			console.error('Failed to close window:', e2);
		}
	}
}

// Event listeners
reminderSnooze.addEventListener('click', async () => {
	// Stop beep immediately
	await stopBeep();
	stopVibration();
	
	if (currentReminder) {
		// Snooze for 5 minutes
		const when = Date.now() + 5 * 60 * 1000;
		currentReminder.when = when;
		currentReminder.enabled = true;
		await saveUpdate(currentReminder);
		await schedule(currentReminder);
		
		// Close the tab
		await closeTab();
	}
});

reminderDone.addEventListener('click', async () => {
	// Stop beep immediately
	await stopBeep();
	stopVibration();
	
	if (currentReminder) {
		currentReminder.completed = true;
		currentReminder.enabled = false;
		await saveUpdate(currentReminder);
		await cancelAlarm(currentReminder.id);
		
		// Close the tab
		await closeTab();
	}
});

// Auto-close after 60 seconds if no action is taken
setTimeout(async () => {
	stopVibration();
	await closeTab();
}, 60000);

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeNotification);

// Also try to initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeNotification);
} else {
	initializeNotification();
}
