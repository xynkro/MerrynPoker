# Merryn Poker

Private poker room tracker for Merryn Rd games. Single-file PWA that runs offline on Sarah's iPhone and syncs to Google Sheets when online.

## Quick Start

1. Open `index.html` in Safari (or any browser)
2. Add to Home Screen for PWA mode
3. Login with your PIN

## Files

| File | Purpose |
|------|---------|
| `index.html` | The entire app — HTML, CSS, JS in one file |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker (offline cache) |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | PWA icons |
| `poker-bg.jpg` | Login screen background |
| `merryn-*.jpg` | In-app rotating backgrounds (5 images) |
| `apps-script.gs` | Google Apps Script for Sheets sync backend |
| `docs/` | Design spec and architecture notes |

## Architecture

- **Frontend:** Single-file PWA (IndexedDB + service worker for offline)
- **Backend:** Google Sheets + Apps Script (optional sync)
- **Auth:** 3-tier PIN system (Owner / Dealer / Player)
- **Data:** IndexedDB on-device, Google Sheets as shared backup

## Hosting

Deploy via GitHub Pages or AirDrop `index.html` + images directly to a phone.

## Data

All player data, financial records, and backups are stored locally in IndexedDB and optionally synced to Google Sheets. **No sensitive data is committed to this repo.**
