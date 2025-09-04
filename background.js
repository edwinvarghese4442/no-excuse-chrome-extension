const STORAGE_KEY = 'reminders_v1';

async function getAll(){
	const { [STORAGE_KEY]: val } = await chrome.storage.local.get(STORAGE_KEY);
	return Array.isArray(val) ? val : [];
}

async function saveAll(items){
	await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

chrome.runtime.onInstalled.addListener(async () => {
	await rescheduleAll();
});

chrome.runtime.onStartup.addListener(async () => {
	await rescheduleAll();
});

async function rescheduleAll(){
	const items = await getAll();
	for (const r of items){
		if (r.enabled && !r.completed && r.when > Date.now()){
			await chrome.alarms.create(`reminder:${r.id}`, { when: r.when });
		}
	}
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
	console.log('Alarm fired:', alarm.name);
	
	if (!alarm.name.startsWith('reminder:')) return;
	const id = alarm.name.split(':')[1];
	const all = await getAll();
	const reminder = all.find(r => r.id === id);
	if (!reminder) return;

	console.log('Processing reminder:', reminder.title);

	// mark fired but keep available
	reminder.enabled = false;
	await saveAll(all);

	// Only play beep if enabled for this reminder
	if (reminder.beepEnabled !== false) {
		await ensureOffscreen();
		await chrome.runtime.sendMessage({ type: 'PLAY_ALARM', payload: { title: reminder.title } }).catch(()=>{});
	}

	// Store the reminder data for the popup
	await chrome.storage.local.set({ 
		'current_reminder': reminder
	});

	// Create a new tab with the reminder popup
	try {
		const tab = await chrome.tabs.create({
			url: 'notification.html',
			active: true, // Make it the active tab
			index: 0 // Put it at the beginning
		});
		
		// Focus the window containing this tab
		await chrome.windows.update(tab.windowId, { focused: true });
		console.log('Reminder tab created successfully');
		
	} catch (e) {
		console.error('Failed to create reminder tab:', e);
		
		// Fallback to Chrome notification if tab creation fails
		const notificationId = `reminder:${id}`;
		chrome.notifications.create(notificationId, {
			type: 'basic',
			title: '⏰ Zercuse Reminders',
			message: reminder.title,
			priority: 2,
			requireInteraction: true,
			buttons: [
				{ title: 'Snooze (5 min)' },
				{ title: 'Mark Done' }
			]
		});
	}
});

// Handle message to stop alarm
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'STOP_ALARM') {
		// Forward the stop message to offscreen document
		chrome.runtime.sendMessage({ type: 'STOP_ALARM' }).catch(() => {});
		sendResponse({ success: true });
	}
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
	console.log('Notification button clicked:', notificationId, buttonIndex);
	
	if (!notificationId.startsWith('reminder:')) return;
	const id = notificationId.split(':')[1];
	const all = await getAll();
	const reminder = all.find(r => r.id === id);
	if (!reminder) return;

	// Stop the beep immediately
	await chrome.runtime.sendMessage({ type: 'STOP_ALARM' }).catch(() => {});

	if (buttonIndex === 0){
		// Snooze 5 minutes
		const when = Date.now() + 5 * 60 * 1000;
		reminder.when = when;
		reminder.enabled = true;
		await saveAll(all);
		await chrome.alarms.create(`reminder:${reminder.id}`, { when });
		console.log('Reminder snoozed for 5 minutes');
	} else if (buttonIndex === 1){
		reminder.completed = true;
		reminder.enabled = false;
		await saveAll(all);
		console.log('Reminder marked as done');
	}
	
	// Clear the notification
	chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
	console.log('Notification clicked:', notificationId);
	if (notificationId.startsWith('reminder:')){
		chrome.notifications.clear(notificationId);
	}
});

async function ensureOffscreen(){
	// Create offscreen document if it doesn't already exist
	if (chrome.offscreen && chrome.offscreen.hasDocument){
		const has = await chrome.offscreen.hasDocument();
		if (has) return;
	}
	try {
		await chrome.offscreen.createDocument({
			url: 'offscreen.html',
			reasons: ['AUDIO_PLAYBACK'],
			justification: 'Play alarm sound when reminders fire'
		});
	} catch (e) {
		// Ignore if already exists
	}
}
