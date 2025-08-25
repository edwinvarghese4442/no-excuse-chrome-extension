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
	if (!alarm.name.startsWith('reminder:')) return;
	const id = alarm.name.split(':')[1];
	const all = await getAll();
	const reminder = all.find(r => r.id === id);
	if (!reminder) return;

	// mark fired but keep available
	reminder.enabled = false;
	await saveAll(all);

	await ensureOffscreen();
	await chrome.runtime.sendMessage({ type: 'PLAY_ALARM', payload: { title: reminder.title } }).catch(()=>{});

	const notificationId = `n:${id}`;
	chrome.notifications.create(notificationId, {
		type: 'basic',
		iconUrl: 'icon-128.png',
		title: 'Reminder',
		message: reminder.title,
		priority: 2,
		buttons: [
			{ title: 'Snooze 5 min' },
			{ title: 'Mark done' }
		]
	});
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
	if (!notificationId.startsWith('n:')) return;
	const id = notificationId.split(':')[1];
	const all = await getAll();
	const reminder = all.find(r => r.id === id);
	if (!reminder) return;

	if (buttonIndex === 0){
		// Snooze 5 minutes
		const when = Date.now() + 5 * 60 * 1000;
		reminder.when = when;
		reminder.enabled = true;
		await saveAll(all);
		await chrome.alarms.create(`reminder:${reminder.id}`, { when });
	} else if (buttonIndex === 1){
		reminder.completed = true;
		reminder.enabled = false;
		await saveAll(all);
	}
	chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener((notificationId) => {
	if (notificationId.startsWith('n:')){
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