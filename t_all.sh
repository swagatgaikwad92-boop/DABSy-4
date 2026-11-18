#!/bin/bash
cd "$(dirname "$0")"
for t in t_chatbox t_study t_prefs t_schedule t_livetalk t_livetalk2 t_widgets t_timer t_fallback t_sweep t_doodle t_doodle_maths t_doodle_custom t_vision_pipeline; do
  echo "== $t"; python3 $t.py 2>&1 | grep -E "FAIL|passed|Error|Traceback" 
done
node tests/t_doodle_math.js   # engine unit tests (no browser)
node t_vision_worker.mjs
