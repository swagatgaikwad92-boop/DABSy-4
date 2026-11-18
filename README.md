# DABSy v12 browser tests

Headless-Chromium tests (Playwright for Python) that drive the real app with a touch-emulated phone viewport.
The AI proxy, weather and search providers are mocked, so they run offline.

    pip install playwright && playwright install chromium
    cd tests && ./t_all.sh                 # chatbox, study, prefs, schedule, live talk, widgets
    python3 t_timer.py ; python3 t_fallback.py ; python3 t_sweep.py

`shots.py` / `shots2.py` write screenshots to /tmp/shots (day and night).
These tests prove the interface logic. They cannot prove that a live AI model answers physics correctly, or how the app feels on a particular phone.
