# v12.1 Doodle Space. AI is MOCKED (D.ai.vision / D.ai.study / D.ai.generate replaced) — real vision AI is NOT exercised here.
from harness import *
srv=serve()
def stroke(pg,pts,steps=6,pt="mouse"):
    # drive real pointer events on the view
    pg.evaluate("""([pts,steps,pt])=>{const v=document.querySelector('.dd-view');const r=v.getBoundingClientRect();
      const ev=(t,x,y,id=1)=>v.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:pt,clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,button:0,buttons:1,isPrimary:true,pressure:.5}));
      ev('pointerdown',pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];for(let s=1;s<=steps;s++)ev('pointermove',a[0]+(b[0]-a[0])*s/steps,a[1]+(b[1]-a[1])*s/steps)}
      ev('pointerup',pts[pts.length-1][0],pts[pts.length-1][1]);}""",[pts,steps,pt])
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,h=800)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    # --- entry: double-tap bubbles include Doodle Space
    pg.evaluate("window.DABSy.bus.emit('face:doubletap')") ; 
    pg.evaluate("document.querySelector('#face')&&0")
    pg.wait_for_timeout(300)
    # open the ecosystem the same way the gesture does
    pg.keyboard.press("ArrowDown") ; pg.wait_for_timeout(700)
    have=pg.evaluate("!!document.querySelector('.eco-bubble[data-app=doodle]')")
    check("Doodle Space bubble is among the app bubbles",have)
    check("doodle module is NOT loaded before it is used (lazy)",not pg.evaluate("!!window.DABSy.doodle"))
    if have: pg.click(".eco-bubble[data-app=doodle]"); pg.wait_for_timeout(1500)
    check("tapping the bubble lazy-loads and opens Doodle Space",pg.evaluate("!!window.DABSy.doodle && window.DABSy.doodle.state().open"))
    check("mode chooser shows Fun and Maths",pg.locator(".dd-mode").count()==2 and pg.evaluate("document.getElementById('doodle').dataset.view")=="modes")
    pg.screenshot(path="/tmp/dd_modes.png")
    # --- FUN
    pg.click(".dd-mode[data-mode=fun]"); pg.wait_for_timeout(900)
    check("fun workspace with fun toolbar (pen, pencil, eraser, size, colour, undo, redo, ask)",pg.locator(".dd-bar .dd-t").count()==8 and pg.locator("[aria-label='Ask DABSy']").count()==1)
    stroke(pg,[(60,100),(160,160),(260,100)],pt="touch")
    stroke(pg,[(60,200),(260,200)],pt="mouse")
    n=pg.evaluate("window.DABSy.doodle._S.page.strokes.length"); check("finger/touch and mouse strokes are recorded (2)",n==2,n)
    px=pg.evaluate("(()=>{const c=document.querySelector('.dd-ink');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let k=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)k++;return k})()")
    check("ink is actually painted on the canvas",px>200,px)
    pg.click("[aria-label=Undo]"); check("undo removes last stroke",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==1)
    pg.click("[aria-label=Redo]"); check("redo restores it",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==2)
    pg.click("[aria-label=Eraser]"); stroke(pg,[(60,200),(260,200)]); 
    erased=pg.evaluate("window.DABSy.doodle._S.page.strokes.slice(-1)[0].t")
    check("eraser stroke recorded as erase",erased=="e")
    pg.click("[aria-label=Undo]")
    pg.click("[aria-label=Colour]"); pg.click(".dd-sw >> nth=1"); stroke(pg,[(60,300),(200,340)])
    check("colour selection applies to new strokes",pg.evaluate("window.DABSy.doodle._S.page.strokes.slice(-1)[0].c")=="#4f62c4")
    pg.click("[aria-label=Pencil]"); stroke(pg,[(60,380),(200,420)]); check("pencil tool",pg.evaluate("window.DABSy.doodle._S.page.strokes.slice(-1)[0].t")=="c")
    pg.click("[aria-label='Pen settings']"); pg.evaluate("(()=>{const r=document.querySelector('input[aria-label=\"Pen thickness\"]');r.value=12;r.dispatchEvent(new Event('input'))})()"); stroke(pg,[(60,460),(200,500)])
    check("adjustable thickness",pg.evaluate("window.DABSy.doodle._S.page.strokes.slice(-1)[0].w")==12)
    # two-finger gesture must not leave a stroke
    before=pg.evaluate("window.DABSy.doodle._S.page.strokes.length")
    pg.evaluate("""()=>{const v=document.querySelector('.dd-view'),r=v.getBoundingClientRect();const e=(t,id,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,isPrimary:id==1}));
      e('pointerdown',1,100,300);e('pointerdown',2,200,300);e('pointermove',1,80,300);e('pointermove',2,240,300);e('pointerup',1,80,300);e('pointerup',2,240,300)}""")
    check("two-finger pinch zooms and leaves no stray stroke",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==before and pg.evaluate("window.DABSy.doodle._S.pad.getView().s")>0)
    # --- persistence
    pg.wait_for_timeout(900)
    saved=pg.evaluate("""new Promise(r=>{const q=indexedDB.open('dabsy-doodle',1);q.onsuccess=()=>{const t=q.result.transaction('kv').objectStore('kv').getAll();t.onsuccess=()=>r(t.result.length)}})""")
    check("autosaved into IndexedDB (meta + page records)",saved>=2,saved)
    # --- ask DABSy (MOCK)
    pg.evaluate("""()=>{const D=window.DABSy;window.__orig={vs:D.ai.visionStatus,vi:D.ai.vision};D.ai.visionStatus=()=>({ok:true});window.__vis=[];D.ai.vision=async o=>{window.__vis.push({img:(o.image||'').length>100,prompt:o.prompt});return {ok:true,text:'Is that a little cat?'}};}""")
    n0=pg.evaluate("window.__vis.length")
    pg.click("[aria-label='Ask DABSy']"); pg.wait_for_timeout(700)
    check("[MOCK vision service] Ask DABSy sends one image and shows a conversational bubble",pg.evaluate("window.__vis.length")==n0+1 and pg.evaluate("window.__vis[0].img") and "little cat" in pg.inner_text(".dd-bubble"))
    check("no AI request after plain strokes (user must initiate)",pg.evaluate("window.__vis.length")==1 and (stroke(pg,[(80,560),(180,600)]) or True) and pg.evaluate("window.__vis.length")==1)
    pg.evaluate("window.DABSy.ai.vision=async o=>({ok:true,text:'Now I see where the inspiration came from.'})")
    pg.fill(".dd-binp","It's my chemistry teacher"); pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    check("[MOCK] reply continues the conversation","inspiration" in pg.inner_text(".dd-bubble"))
    pg.evaluate("(()=>{const D=window.DABSy;D.ai.vision=window.__orig.vi;D.ai.visionStatus=window.__orig.vs})()"); pg.click("[aria-label='Ask DABSy']"); pg.wait_for_timeout(1500)
    check("REAL path, no vision service configured: honest setup card, no fake analysis",("No vision service is connected" in pg.inner_text(".dd-card")) and pg.locator("input[aria-label='Vision service address']").count()==1)
    pg.screenshot(path="/tmp/dd_fun.png")
    # --- pages
    pg.click("[aria-label='New page']"); pg.wait_for_timeout(500)
    check("new page created -> Page 2 / 2",pg.inner_text(".dd-pagelbl")=="Page 2 / 2")
    check("new page is empty (own content)",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==0)
    stroke(pg,[(70,100),(200,150)]); pg.click("[aria-label='Previous page']"); pg.wait_for_timeout(500)
    check("previous page restores page 1 content",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")>=6 and pg.inner_text(".dd-pagelbl")=="Page 1 / 2")
    # --- modes separate
    pg.click("[aria-label='Page and notebook options']"); pg.click("text=Switch to Maths mode"); pg.wait_for_timeout(900)
    check("maths notebook is separate (empty, 1 page, graph paper default)",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==0 and pg.inner_text(".dd-pagelbl")=="Page 1 / 1" and pg.evaluate("window.DABSy.doodle._S.meta.bg.k")=="graph")
    check("maths toolbar: pen, eraser, undo, redo, read, check, hint, solve",pg.locator(".dd-bar .dd-t").count()==8 and all(pg.locator(f"[aria-label='{l}']").count()==1 for l in["Pen","Eraser","Undo","Redo","Recognise what I wrote","Check my work","Hint","Solve step by step"]))
    pg.screenshot(path="/tmp/dd_maths_empty.png")
    # reload -> everything restored
    pg.reload(); pg.wait_for_timeout(1800); pg.evaluate("window.DABSy.ecosystem.open()"); pg.wait_for_timeout(900); pg.click(".eco-bubble[data-app=doodle]"); pg.wait_for_timeout(1500)
    check("after reload: chooser shows saved fun notebook",pg.inner_text(".dd-mode[data-mode=fun] small").startswith("Continue · 2 pages"),pg.inner_text(".dd-mode[data-mode=fun] small"))
    pg.click(".dd-mode[data-mode=fun]"); pg.wait_for_timeout(900)
    check("after reload: fun page with strokes restored",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")>=6,pg.evaluate("window.DABSy.doodle._S.page.strokes.length"))
    # delete w/ confirmation + undo
    pg.click("[aria-label='Page and notebook options']"); pg.click("text=Delete page"); pg.wait_for_timeout(500)
    check("delete asks for confirmation",pg.locator(".popup-card").count()>=1 and pg.evaluate("window.DABSy.doodle.state().pages")==2)
    pg.click(".popup-actions >> text=Keep it"); pg.wait_for_timeout(400); check("Keep it deletes nothing",pg.evaluate("window.DABSy.doodle.state().pages")==2)
    pg.click("[aria-label='Page and notebook options']"); pg.click("text=Delete page"); pg.wait_for_timeout(400); pg.click(".popup-actions >> text=Delete"); pg.wait_for_timeout(700)
    check("confirmed delete removes the page",pg.evaluate("window.DABSy.doodle.state().pages")==1)
    pg.click(".toast >> text=Undo"); pg.wait_for_timeout(700)
    check("undo restores the deleted page",pg.evaluate("window.DABSy.doodle.state().pages")==2)
    check("no page errors so far",not errs,errs[:3])
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
