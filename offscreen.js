let ctx;
let currentOscillators = [];
let currentBeepToken = null;

async function playBeepPattern(title){
	if (!ctx) ctx = new AudioContext();
	
	// stop anything already playing
	stopAllBeeps();
	cancelCurrentToken();
	currentBeepToken = { cancelled: false, clear: null };
	
	const durationMs = 400; // single beep duration
	const gapMs = 150;
	const count = 8; // number of beeps

	for (let i = 0; i < count; i++){
		if (currentBeepToken.cancelled) break;
		await playBeep(880, durationMs);
		if (currentBeepToken.cancelled) break;
		await delay(gapMs, currentBeepToken);
	}
}

async function playBeep(freq, ms){
	if (!ctx) return;
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	
	// Add to current oscillators array
	currentOscillators.push({ osc, gain });
	
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0.0, now);
	gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
	gain.gain.linearRampToValueAtTime(0.0, now + ms/1000);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(now + ms/1000 + 0.02);
	await delay(ms, currentBeepToken);
}

function stopAllBeeps() {
	// Stop all current oscillators
	currentOscillators.forEach(({ osc, gain }) => {
		try {
			osc.stop();
			if (ctx){
				gain.gain.cancelScheduledValues(ctx.currentTime);
				gain.gain.setValueAtTime(0, ctx.currentTime);
			}
		} catch (e) {
			// ignore
		}
	});
	currentOscillators = [];
}

function cancelCurrentToken(){
	if (currentBeepToken){
		currentBeepToken.cancelled = true;
		if (typeof currentBeepToken.clear === 'function'){
			try { currentBeepToken.clear(); } catch {}
		}
	}
}

function delay(ms, token){
	return new Promise((resolve) => {
		if (token && token.cancelled) return resolve();
		const t = setTimeout(resolve, ms);
		if (token){
			token.clear = () => { clearTimeout(t); resolve(); };
		}
	});
}

chrome.runtime.onMessage.addListener((msg) => {
	if (msg && msg.type === 'PLAY_ALARM'){
		playBeepPattern(msg.payload?.title || 'Reminder');
	} else if (msg && msg.type === 'STOP_ALARM') {
		cancelCurrentToken();
		stopAllBeeps();
	}
});
