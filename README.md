# Zero Excuse Reminders (Chrome Extension)

Simple Manifest V3 extension to add reminders with an alarm and notification.

## Features
- Add reminders with date + time
- Toggle enable/disable and mark done
- Background alarm via `chrome.alarms`
- Notification with Snooze and Done buttons
- Offscreen page plays a synthesized alarm sound (no audio file needed)

## Load and test in Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked" and select this folder: `/Users/edwinvarghese/Documents/GitHub/no-excuse-chrome-extension`.
4. The extension will appear as "Zero Excuse Reminders". Pin it to the toolbar.
5. Click the toolbar icon to open the popup.
6. Add a new task, choose a date and time in the near future, and Save.
7. Keep Chrome running. When the time arrives, you should see a notification and hear beeps.
   - Use the notification buttons to Snooze 5 min or Mark done.

## Notes
- Chrome must be open for alarms to fire.
- If you edit a reminder time while disabled, re-enable it to reschedule the alarm.
- On browser restart, enabled future reminders are re-scheduled automatically.

## Files
- `manifest.json` — Extension configuration (MV3)
- `popup.html`, `popup.css`, `popup.js` — UI to create and list reminders
- `background.js` — Schedules alarms, shows notifications, triggers audio
- `offscreen.html`, `offscreen.js` — Offscreen document for alarm audio 