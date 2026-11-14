from harness import *
import json
srv=serve()
def rect(pg,id): return pg.evaluate("(id)=>{const r=document.querySelector('.wg-item[data-id=\"'+id+'\"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}",id)
def mem(pg): return pg.evaluate("JSON.parse(localStorage.getItem('dabsy_widgets_v3')||'null')")
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=False,h=800)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.route("**/api.open-meteo.com/**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("()=>{const w=window.DABSy.widgets;['clock','date','tasks'].forEach(i=>w.add(i));w.openChooser();}"); pg.wait_for_timeout(600); pg.mouse.click(200,780); pg.wait_for_timeout(1200)
    pg.wait_for_function("document.querySelectorAll('.wg-card.in').length==3",timeout=8000)
    r={i:rect(pg,i) for i in ['clock','date','tasks']}
    ov=lambda a,b:not(a['x']+a['w']<=b['x'] or b['x']+b['w']<=a['x'] or a['y']+a['h']<=b['y'] or b['y']+b['h']<=a['y'])
    check("new widgets are placed without overlapping",not(ov(r['clock'],r['date']) or ov(r['clock'],r['tasks']) or ov(r['date'],r['tasks'])),r)
    # ---- drag clock to a new place, slowly (no momentum)
    c=r['clock']; sx,sy=c['x']+c['w']/2,c['y']+c['h']/2; tx,ty=230,520
    dt0=rect(pg,'date'); tk0=rect(pg,'tasks')
    pg.mouse.move(sx,sy); pg.mouse.down(); 
    for i in range(1,13): pg.mouse.move(sx+(tx-sx)*i/12,sy+(ty-sy)*i/12); pg.wait_for_timeout(25)
    pg.wait_for_timeout(250)
    check("card lifts while dragging",pg.locator(".wg-item.dragging").count()==1)
    pg.mouse.up(); pg.wait_for_timeout(900)
    n=rect(pg,'clock'); cx,cy=n['x']+n['w']/2,n['y']+n['h']/2
    check("widget moved to where it was dropped (anywhere, not a slot)",abs(cx-tx)<30 and abs(cy-ty)<30,(cx,cy,tx,ty))
    check("other widgets did not move",rect(pg,'date')==dt0 and rect(pg,'tasks')==tk0)
    m=mem(pg); print(m)
    check("position persisted",m and any(i['id']=='clock' and abs(i['y']-(n['y']/800))<0.02 for i in m['items']))
    # ---- fling with momentum
    pg.mouse.move(cx,cy); pg.mouse.down()
    for i in range(1,6): pg.mouse.move(cx-i*22,cy-i*10); pg.wait_for_timeout(10)
    pg.mouse.up(); pg.wait_for_timeout(60); p1=rect(pg,'clock'); pg.wait_for_timeout(700); p2=rect(pg,'clock')
    check("released with speed -> keeps gliding a little then settles",(p2['x']<p1['x']-5 or p2['y']<p1['y']-5),(p1,p2))
    check("glide stays inside the screen",p2['x']>=0 and p2['y']>=0 and p2['x']+p2['w']<=390 and p2['y']+p2['h']<=800,p2)
    # ---- drag far off-screen -> clamped
    c=rect(pg,'clock'); pg.mouse.move(c['x']+20,c['y']+20); pg.mouse.down()
    for i in range(1,10): pg.mouse.move(c['x']+20-i*60,c['y']+20-i*60); pg.wait_for_timeout(15)
    pg.wait_for_timeout(250); pg.mouse.up(); pg.wait_for_timeout(800); e=rect(pg,'clock')
    check("cannot be dragged off-screen",e['x']>=0 and e['y']>=0,e)
    # ---- persistence across reload
    before=rect(pg,'clock'); pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("window.DABSy.widgets.openChooser()"); pg.wait_for_timeout(400); pg.mouse.click(200,780); pg.wait_for_timeout(500)
    pg.wait_for_function("document.querySelectorAll('.wg-card.in').length==3",timeout=8000); after=rect(pg,'clock')
    check("positions survive a reload",abs(before['x']-after['x'])<3 and abs(before['y']-after['y'])<3,(before,after))
    # ---- long-press tools: colour
    t=rect(pg,'tasks'); pg.mouse.move(t['x']+t['w']/2,t['y']+t['h']/2); pg.mouse.down(); pg.wait_for_timeout(800); pg.mouse.up(); pg.wait_for_timeout(500)
    check("press-and-hold opens colour/size tools",pg.locator(".wg-tools").count()==1 and pg.locator(".wg-tools .wg-sw").count()==8,pg.locator(".wg-tools .wg-sw").count())
    bg0=pg.evaluate("getComputedStyle(document.querySelector('.wg-tasks')).getPropertyValue('--wg-bg').trim()")
    pg.locator('.wg-sw[data-tone="sage"]').click(); pg.wait_for_timeout(300)
    bg1=pg.evaluate("getComputedStyle(document.querySelector('.wg-tasks')).getPropertyValue('--wg-bg').trim()")
    check("preset colour applied to that widget only",pg.evaluate("document.querySelector('.wg-tasks').dataset.tone")=="sage" and bg1!=bg0 and pg.evaluate("document.querySelector('.wg-clock').dataset.tone")=="glass",(bg0,bg1))
    check("colour persisted",any(i['id']=='tasks' and i['c']=='sage' for i in mem(pg)['items']))
    pg.evaluate("()=>{const i=document.querySelector('.wg-pick');i.value='#aa5577';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}"); pg.wait_for_timeout(300)
    check("custom colour works and picks readable ink",pg.evaluate("document.querySelector('.wg-tasks').style.getPropertyValue('--wg-bg')").startswith("rgba(170,85,119") and any(i['id']=='tasks' and i['c']=='#aa5577' for i in mem(pg)['items']))
    # size
    s0=rect(pg,'tasks')['w']; pg.locator('.wg-tb[aria-label="Larger"]').click(); pg.wait_for_timeout(300); s1=rect(pg,'tasks')['w']
    check("resize larger",s1>s0*1.07,(s0,s1)); pg.locator('.wg-tb[aria-label="Smaller"]').click(); pg.locator('.wg-tb[aria-label="Smaller"]').click(); pg.wait_for_timeout(300)
    check("resize smaller + persisted",rect(pg,'tasks')['w']<s0 and any(i['id']=='tasks' and i['s']<1 for i in mem(pg)['items']))
    pg.mouse.click(200,700); pg.wait_for_timeout(300)
    check("tools close on outside tap",pg.locator(".wg-tools").count()==0)
    # corner resize in customise mode
    pg.evaluate("window.DABSy.widgets.edit()"); pg.wait_for_timeout(400)
    g=pg.locator('.wg-item[data-id="date"] .wg-grow').bounding_box(); w0=rect(pg,'date')['w']
    pg.mouse.move(g['x']+17,g['y']+17); pg.mouse.down(); pg.mouse.move(g['x']+17+70,g['y']+17,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    check("corner handle resizes",rect(pg,'date')['w']>w0*1.2,(w0,rect(pg,'date')['w']))
    pg.evaluate("window.DABSy.widgets.done()"); pg.wait_for_timeout(300)
    # ---- still functional after being moved: tap tasks opens the tasks panel
    t=rect(pg,'tasks'); pg.mouse.click(t['x']+t['w']/2,t['y']+t['h']/2); pg.wait_for_timeout(1200)
    check("tapping a moved widget still works (Tasks opens)",pg.evaluate("document.body.classList.contains('sheet-open')"))
    # ---- day theme tint
    pg.evaluate("document.querySelectorAll('.sheet-layer,.sheet').forEach(()=>{});window.DABSy.ui&&0")
    pg.screenshot(path="/tmp/wg_night.png")
    # ---- migration from v2 slots
    pg2=b.contexts[0].new_page(); 
    b.close()
    b,pg,errs2=newpage(p,touch=False,h=800,init="localStorage.setItem('dabsy_widgets_v1',JSON.stringify({v:2,on:true,items:[{id:'clock',slot:0},{id:'weather',slot:3}]}));")
    pg.evaluate("window.DABSy.widgets.openChooser()"); pg.wait_for_timeout(500); pg.mouse.click(200,780); pg.wait_for_timeout(600)
    L=pg.evaluate("window.DABSy.widgets.list()")
    check("a saved v2 arrangement is converted (same widgets kept)",sorted(i['id'] for i in L)==['clock','weather'],L)
    check("no page errors",not errs and not errs2,(errs+errs2)[:3])
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
