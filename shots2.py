from harness import *
import json, datetime, re
src=open('t_study.py').read(); SOL=re.search(r'SOL = r"""(.*?)"""',src,re.S).group(1)
now=datetime.datetime.now().replace(hour=8,minute=0,second=0,microsecond=0)
srv=serve()
try:
  with sync_playwright() as p:
    for theme in ("light","dark"):
      b,pg,errs=newpage(p,touch=True,h=800,clock=now,init=f"localStorage.setItem('dabsy_settings',JSON.stringify({{theme:'{theme}'}}));")
      pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps({"reply":SOL})))
      pg.evaluate("window.DABSy.memory.getSettings().speakReplies=false;window.DABSy.studyBlock.activate()"); pg.wait_for_timeout(900)
      pg.evaluate("window.DABSy.app.handleUserUtterance('A 2 kg block feels a 10 N force. Find the acceleration using Newton second law')")
      pg.wait_for_selector("#projection-content .katex",timeout=15000); pg.wait_for_timeout(900)
      pg.screenshot(path=f"/tmp/shots/study_{theme}.png")
      pg.evaluate("window.DABSy.require('dayplan')"); pg.wait_for_timeout(1200)
      pg.evaluate("""(k)=>{const D=window.DABSy;D.projection&&0;document.getElementById('projection-close').click()}""","")
      pg.wait_for_timeout(800)
      key=pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
      pg.evaluate("""(k)=>{const D=window.DABSy;const q=(t,m,pr)=>({title:t,taskId:null,durationMin:m,priority:pr||'normal',why:'',subject:'',isNew:true,day:null});
        const p=D.dayplan.buildPlan('day','The rest of today',{days:[{key:k,from:8*60+5,to:20*60}],queue:[q('Physics: kinematics',60,'high'),q('Mathematics: limits',45),q('Chemistry: mole concept',30)]},{assumptions:[]});D.dayplan.open(p)}""",key)
      pg.wait_for_selector(".dp-row.work",timeout=5000); pg.wait_for_timeout(2500)
      for _ in range(2):
          bt=pg.locator('.popup-actions button',has_text='Not now')
          if bt.count(): bt.first.click(); pg.wait_for_timeout(500)
      pg.screenshot(path=f"/tmp/shots/plan_{theme}.png")
      tb=pg.locator('.dp-row.work').nth(1).locator('.dp-time-btn').bounding_box()
      pg.mouse.move(tb['x']+30,tb['y']+20); pg.mouse.down(); pg.wait_for_timeout(750); pg.mouse.up(); pg.wait_for_timeout(700)
      pg.screenshot(path=f"/tmp/shots/picker_{theme}.png")
      print(theme,errs[:2]); b.close()
finally: srv.terminate()
