#!/bin/bash
cd "$(dirname "$0")"
for t in t_chatbox t_study t_prefs t_schedule t_livetalk t_widgets; do
  echo "== $t"; python3 $t.py 2>&1 | grep -E "FAIL|passed|Error|Traceback" 
done
