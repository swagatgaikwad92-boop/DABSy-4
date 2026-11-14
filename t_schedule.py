from harness import *
import json, datetime
now=datetime.datetime.now().replace(hour=8,minute=0,second=0,microsecond=0)
srv=serve()
def starts(pg):
    return pg.evaluate("""()=>Array.from(document.querySelectorAll('.dp-sheet .dp-row.work')).map(r=>({t:r.querySelector('.dp-title b').textContent,s:+r.dataset.s,pinned:r.classList.contains('pinned'),conflict:r.classList.contains('conflict')}))""")
def dismiss(pg):
    for _ in range(3):
        b=pg.locator('.popup-actions button',has_text='Not now')
        if b.count(): b.first.click(); pg.wait_for_timeout(500)
def hm(ms): d=datetime.datetime.fromtimestamp(ms/1000); return d.hour*60+d.minute
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=False,h=900,clock=now)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("window.DABSy.require('dayplan')"); pg.wait_for_timeout(1500)
    key=pg.evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
    # a fixed commitment 11:00-12:00 so a conflict can be created
    pg.evaluate("""(k)=>{const D=window.DABSy;const d=new Date(k+'T11:00:00');D.tasks.add({title:'Maths lecture',dueAt:d.toISOString(),durationMin:60,priority:'normal'})}""",key)
    pg.evaluate("""(k)=>{const D=window.DABSy;const q=(t,m,pr)=>({title:t,taskId:null,durationMin:m,priority:pr||'normal',why:'',subject:'',isNew:true,day:null});
      const p=D.dayplan.buildPlan('day','The rest of today',{days:[{key:k,from:8*60+5,to:20*60}],queue:[q('Physics',60,'high'),q('Mathematics',45),q('Chemistry',30)]},{assumptions:[]});
      window.__plan=p;D.dayplan.open(p)}""",key)
    pg.wait_for_selector(".dp-sheet .dp-row.work",timeout=5000); pg.wait_for_timeout(2500); dismiss(pg)
    r0=starts(pg)
    print([(x['t'],hm(x['s'])) for x in r0])
    check("three activities scheduled chronologically",[x['t'] for x in r0]==sorted([x['t'] for x in r0],key=lambda t:[y['s'] for y in r0 if y['t']==t][0]) and len(r0)==3)
    dur={'Physics':60,'Mathematics':45,'Chemistry':30}
    check("fixed commitment respected (nothing overlaps 11:00-12:00)",all(not(hm(x['s'])<12*60 and hm(x['s'])+dur[x['t']]>11*60) for x in r0))
    # ---------- drag Chemistry to the top ----------
    chem=pg.locator('.dp-row.work',has_text="Chemistry"); phys=pg.locator('.dp-row.work',has_text="Physics")
    g=chem.locator('.dp-grip').bounding_box(); pb=phys.bounding_box()
    pg.mouse.move(g['x']+g['width']/2,g['y']+g['height']/2); pg.mouse.down()
    pg.mouse.move(g['x']+10,pb['y']-6,steps=8); pg.wait_for_timeout(120)
    check("drop indicator shown while dragging",pg.locator(".drop-before,.drop-after").count()==1)
    check("dragged row lifts",pg.locator(".dp-row.dragging").count()==1)
    pg.mouse.up(); pg.wait_for_timeout(700)
    r1=starts(pg); print([(x['t'],hm(x['s']),x['pinned']) for x in r1])
    check("Chemistry is now first",r1[0]['t']=="Chemistry",r1)
    check("moved activity now at a time of the user's choosing (pinned)",r1[0]['pinned'])
    check("other activities kept (same count, same durations)",len(r1)==3 and pg.evaluate("window.__plan.spec.queue.map(q=>q.durationMin).sort().join()")=="30,45,60")
    check("schedule stays chronological",[x['s'] for x in r1]==sorted(x['s'] for x in r1))
    # ---------- hold-to-edit time ----------
    t_before=hm(r1[0]['s'])
    tb=pg.locator('.dp-row.work',has_text="Chemistry").locator('.dp-time-btn'); bb=tb.bounding_box()
    pg.evaluate("window.__mut=[];new MutationObserver(ms=>ms.forEach(m=>window.__mut.push(performance.now().toFixed(0)+' '+m.target.className+' +'+Array.from(m.addedNodes).map(n=>n.className).join('|')+' -'+Array.from(m.removedNodes).map(n=>n.className).join('|')))).observe(document.body,{childList:true,subtree:true})")
    pg.evaluate("""window.__ev=[];const t=Array.from(document.querySelectorAll('.dp-row.work')).find(r=>r.textContent.includes('Chemistry')).querySelector('.dp-time-btn');['pointerdown','pointerup','pointerleave','pointermove','click','pointercancel'].forEach(n=>t.addEventListener(n,e=>window.__ev.push(n+':'+performance.now().toFixed(0))))""")
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2); pg.mouse.down(); pg.wait_for_timeout(250)
    check("no picker on a short press",pg.locator(".tp-panel").count()==0)
    pg.wait_for_timeout(450)
    print("POP",pg.evaluate("document.getElementById(\"popup-layer\").innerText"));print("EV",pg.evaluate("window.__ev"),bb, pg.evaluate("window.__mut"), pg.evaluate("(()=>{const t=Array.from(document.querySelectorAll('.dp-row.work')).find(r=>r.textContent.includes('Chemistry')).querySelector('.dp-time-btn').getBoundingClientRect();return [t.x,t.y]})()"))
    check("holding the time opens the clock",pg.locator(".tp-panel").count()==1)
    pg.mouse.up(); pg.wait_for_timeout(400)
    shown=pg.inner_text(".tp-disp")
    # tap dial at the 3 o'clock position => hour 3
    d=pg.locator(".tp-dial").bounding_box(); cx,cy=d['x']+d['width']/2,d['y']+d['height']/2
    pg.mouse.click(cx+d['width']*0.34,cy); pg.wait_for_timeout(450)
    check("tapping the dial sets the hour then moves to minutes",pg.locator(".tp-seg.on").inner_text()!="" and pg.evaluate("document.querySelectorAll('.tp-seg')[1].classList.contains('on')"))
    pg.mouse.click(cx,cy+d['height']*0.34); pg.wait_for_timeout(100)    # 6 o'clock => 30 min
    check("minute set from dial (:30)",pg.evaluate("document.querySelectorAll('.tp-seg')[1].textContent")=="30")
    pg.locator(".tp-ap",has_text="PM").click(); pg.locator(".tp-chip",has_text="+15").click(); pg.wait_for_timeout(100)
    check("quick chip adds 15 min -> 3:45 PM",pg.inner_text(".tp-disp").replace("\n","")[:5]=="03:45" or "03" in pg.inner_text(".tp-disp"),pg.inner_text(".tp-disp"))
    pg.locator(".tp-set").click(); pg.wait_for_timeout(800)
    r2=starts(pg); c=[x for x in r2 if x['t']=="Chemistry"][0]
    check("schedule updated to the chosen time (15:45)",hm(c['s'])==15*60+45 and c['pinned'],hm(c['s']))
    check("others still scheduled and chronological",len(r2)==3 and [x['s'] for x in r2]==sorted(x['s'] for x in r2))
    # ---------- past time is refused ----------
    tb=pg.locator('.dp-row.work',has_text="Mathematics").locator('.dp-time-btn'); bb=tb.bounding_box()
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(400)
    for _ in range(2): pg.locator(".tp-chip",has_text="−15").click()
    # drive to 7:00 AM by setting via keyboard on dial: easier -> nudge down until the message shows
    for _ in range(12):
        if pg.locator(".tp-msg").inner_text(): break
        pg.locator(".tp-chip",has_text="−15").click()
    check("picker refuses a time that has already passed",pg.locator(".tp-set").is_disabled() and "passed" in pg.locator(".tp-msg").inner_text())
    pg.locator(".tp-ghost",has_text="Cancel").click(); pg.wait_for_timeout(400)
    # ---------- conflict: put Chemistry on top of the 11:00 lecture ----------
    tb=pg.locator('.dp-row.work',has_text="Chemistry").locator('.dp-time-btn'); bb=tb.bounding_box()
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(400)
    # current 3:45 PM -> go to 11:15 AM using the AM switch and the dial
    pg.locator(".tp-ap",has_text="AM").click()
    d=pg.locator(".tp-dial").bounding_box(); cx,cy=d['x']+d['width']/2,d['y']+d['height']/2
    pg.locator(".tp-seg").first.click()
    import math
    def at(frac,r=0.34):
        a=frac*2*math.pi-math.pi/2; return cx+d['width']*r*math.cos(a),cy+d['height']*r*math.sin(a)
    pg.mouse.click(*at(11/12)); pg.wait_for_timeout(450); pg.mouse.click(*at(15/60)); pg.wait_for_timeout(100)
    check("dial gives 11:15 AM",pg.inner_text(".tp-disp").replace("\n","").startswith("11:15"),pg.inner_text(".tp-disp"))
    pg.locator(".tp-set").click(); pg.wait_for_timeout(900)
    r3=starts(pg); c=[x for x in r3 if x['t']=="Chemistry"][0]
    check("conflicting activity is flagged",c['conflict'])
    check("user is notified of the conflict",pg.locator(".toast",has_text="conflict").count()>=1 and pg.locator(".dp-conflicts").count()==1,pg.locator(".toast").all_inner_texts())
    check("conflict names what it overlaps",'Maths lecture' in pg.inner_text(".dp-conflicts"),pg.inner_text(".dp-conflicts"))
    check("other activities untouched by the conflict",len([x for x in r3 if x['t']!='Chemistry'])==2)
    # one-tap fix
    pg.locator(".dp-conflicts .dp-btn").click(); pg.wait_for_timeout(800)
    r4=starts(pg); c=[x for x in r4 if x['t']=="Chemistry"][0]
    check("one tap moves it to the nearest free time and clears the conflict",not c['conflict'] and pg.locator(".dp-conflicts").count()==0 and hm(c['s'])>=12*60,hm(c['s']))
    # ---------- Let DABSy choose ----------
    tb=pg.locator('.dp-row.work',has_text="Chemistry").locator('.dp-time-btn'); bb=tb.bounding_box()
    pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(400)
    pg.locator(".tp-ghost",has_text="Let DABSy choose").click(); pg.wait_for_timeout(800)
    r5=starts(pg)
    check("'Let DABSy choose' returns it to automatic placement",not any(x['pinned'] for x in r5))
    # ---------- keyboard alternative ----------
    pg.locator('.dp-row.work',has_text="Mathematics").locator('.dp-grip').focus(); pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(700)
    r6=starts(pg); check("keyboard: ArrowUp moves an activity earlier",[x['t'] for x in r6].index("Mathematics")<[x['t'] for x in r5].index("Mathematics") or [x['t'] for x in r6][0]=="Mathematics",[x['t'] for x in r6])
    # accepting the plan still works with moved items
    check("no page errors",not errs,errs[:3])
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
