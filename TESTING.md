# Testing locally (including on your phone)

## 1. Simulate mobile in the browser (no phone needed)

1. Run the app locally:
   ```bash
   cd /path/to/tines
   python server.py
   ```
2. Open **http://localhost:5050** in Chrome or Firefox.
3. Open **DevTools** (F12 or right‑click → Inspect).
4. Turn on **device mode**:
   - **Chrome:** DevTools → click the device icon (phone/tablet) or `Ctrl+Shift+M` (Windows) / `Cmd+Shift+M` (Mac).
   - **Firefox:** DevTools → click the device icon or `Ctrl+Shift+M` / `Cmd+Shift+M`.
5. Pick a device (e.g. iPhone 14, Pixel 7) or set a custom width (e.g. 390px). Refresh if needed.
6. Click through: landing → hub → each option to check layout on small screens.

## 2. Test on your real phone (same Wi‑Fi)

1. Start the server on your computer:
   ```bash
   python server.py
   ```
   (The server already runs with `host="0.0.0.0"`, so it’s reachable on your network.)

2. Find your computer’s local IP:
   - **Mac:** System Settings → Network → Wi‑Fi → Details, or run `ipconfig getifaddr en0`.
   - **Windows:** `ipconfig` and look for “IPv4 Address” under your Wi‑Fi adapter.

3. On your phone (connected to the **same Wi‑Fi**), open:
   ```text
   http://YOUR_IP:5050
   ```
   e.g. `http://192.168.1.10:5050`.

4. Test the same flows; fix any layout issues, then commit and deploy.

## Responsive breakpoints in the app

- **768px and below:** Tablet / large phone (smaller hub icons, avatar choices, chat).
- **480px and below:** Small phone (tighter layout, chat header status hidden, input font 16px to avoid iOS zoom).
