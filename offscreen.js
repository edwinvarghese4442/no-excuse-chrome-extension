let ctx;

async function playBeepPattern(title){
	if (!ctx) ctx = new AudioContext();
	const durationMs = 400; // single beep duration
	const gapMs = 150;
	const count = 8; // number of beeps

	for (let i = 0; i < count; i++){
		await playBeep(880, durationMs);
		await delay(gapMs);
	}
}

async function playBeep(freq, ms){
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0.0, now);
	gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
	gain.gain.linearRampToValueAtTime(0.0, now + ms/1000);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(now + ms/1000 + 0.02);
	await delay(ms);
}

function delay(ms){
	return new Promise(r => setTimeout(r, ms));
}

chrome.runtime.onMessage.addListener((msg) => {
	if (msg && msg.type === 'PLAY_ALARM'){
		playBeepPattern(msg.payload?.title || 'Reminder');
	}
}); 