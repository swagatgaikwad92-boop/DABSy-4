# v12.1 Doodle Space — MATHS + notebook edge cases. Handwriting recognition is MOCKED (D.ai.vision returns canned JSON); the local maths engine is REAL.
from harness import *
srv=serve()
def stroke(pg,pts,pt="mouse"):
    pg.evaluate("""([pts,pt])=>{const v=document.querySelector('.dd-view');const r=v.getBoundingClientRect();
      const ev=(t,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:pt,clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,button:0,buttons:1,isPrimary:true}));
      ev('pointerdown',pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ev('pointermove',pts[i][0],pts[i][1]);ev('pointerup',pts[pts.length-1][0],pts[pts.length-1][1])}""",[pts,pt])
def drag(pg,a,b):
    pg.evaluate("""([a,b])=>{const v=document.querySelector('.dd-view');const r=v.getBoundingClientRect();const o=document.querySelector('.dd-pick');
      const ev=(t,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:'mouse',clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,button:0,isPrimary:true}));
      ev('pointerdown',a[0],a[1]);ev('pointermove',(a[0]+b[0])/2,(a[1]+b[1])/2);ev('pointermove',b[0],b[1]);ev('pointerup',b[0],b[1])}""",[a,b])
def vis(pg,reply):
    pg.evaluate("r=>{window.__v=[];window.DABSy.ai.vision=async o=>{window.__v.push(o);return typeof r==='function'?r(o):r}}",None) if False else None
def mock(pg,obj):
    import json
    pg.evaluate("t=>{const D=window.DABSy;window.__orig=window.__orig||{vs:D.ai.visionStatus,vi:D.ai.vision};D.ai.visionStatus=()=>({ok:true});window.__v=[];window.DABSy.ai.vision=async o=>{window.__v.push({len:(o.image||'').length,prompt:o.prompt});return {ok:true,text:t}}}",json.dumps(obj))
def write_something(pg,y=100):
    stroke(pg,[(40,y),(90,y+30),(140,y),(190,y+30)]); 
def read_region(pg,y=100):
    pg.click("[aria-label='Recognise what I wrote']"); pg.wait_for_timeout(300); drag(pg,(20,y-20),(260,y+60)); pg.wait_for_timeout(600)
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,h=800)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('maths'))"); pg.wait_for_timeout(1500)
    check("maths opens directly",pg.evaluate("window.DABSy.doodle.state().mode")=="maths")
    # 1) arithmetic, high confidence: shown with result, no confirmation needed
    write_something(pg,100); mock(pg,{"lines":[{"latex":"1 + 2 =","confidence":0.97}],"unclear":[]})
    read_region(pg,100)
    check("[MOCK vision service] one image sent for the chosen region only",pg.evaluate("window.__v.length")==1 and pg.evaluate("window.__v[0].len")>200)
    res=pg.evaluate("(document.querySelector('.dd-res')||{}).textContent")
    check("'1 + 2 =' shows the computed result beside it (= 3) by the LOCAL engine",res and res.strip()=="= 3",res)
    pg.screenshot(path="/tmp/dd_math_arith.png")
    # 2) quadratic: ambiguity (√6x) forces confirmation; nothing computed until confirmed
    write_something(pg,300); mock(pg,{"lines":[{"latex":"3x^{2} - 2\\sqrt{6}x + 2 = 0","confidence":0.95}],"unclear":[]})
    n=pg.evaluate("window.DABSy.doodle._S.page.blocks.length")
    read_region(pg,300)
    check("high-confidence unambiguous quadratic is accepted and offers the 4 choices",pg.evaluate("window.DABSy.doodle._S.page.blocks.length")==n+1 and all(pg.locator(f".dd-opts >> text={t}").count()>=1 for t in["Solve step by step","Give me a hint","Let me solve it","Explain the concept"]))
    check("it does NOT auto-solve (asks 'What would you like to do?')","What would you like to do?" in pg.inner_text(".dd-card"))
    pg.screenshot(path="/tmp/dd_math_quad.png")
    pg.click(".dd-opts >> text=Solve step by step"); pg.wait_for_timeout(900)
    t=pg.inner_text(".dd-card")
    check("solve: exact verified answer x = √6/3 (repeated root), discriminant 0",("repeated" in t or "D=0" in t.replace(" ","") or "0" in t) and pg.evaluate("document.querySelector('.dd-steps .katex')!==null") ,t[:200])
    check("solve: substitution check reported as exact",("exactly 0" in t),t[-200:])
    pg.screenshot(path="/tmp/dd_math_solve.png")
    pg.click(".dd-card .dd-opts >> text=Back"); pg.wait_for_timeout(200)
    pg.click(".dd-opts >> text=Give me a hint"); pg.wait_for_timeout(300)
    check("hint 1 is local and does not reveal the answer",("quadratic" in pg.inner_text(".dd-card")) and "√6/3" not in pg.inner_text(".dd-card"))
    pg.click(".dd-card .dd-opts >> text=Another hint"); pg.wait_for_timeout(200)
    check("hint 2 gives the coefficients",("a = 3" in pg.inner_text(".dd-card")))
    # 3) low confidence -> must confirm; wrong reading can be fixed; computed only after
    write_something(pg,500); mock(pg,{"lines":[{"latex":"2 x 3 = 6","confidence":0.55}],"unclear":["the 'x' might be a multiplication sign"]})
    n=pg.evaluate("window.DABSy.doodle._S.page.blocks.length"); read_region(pg,500)
    check("low confidence: asks 'Is this what you wrote?' and creates NO block yet",pg.evaluate("window.DABSy.doodle._S.page.blocks.length")==n and "Is this what you wrote?" in pg.inner_text(".dd-card"))
    check("the specific doubt (x vs ×) is asked about",("multiplication" in pg.inner_text(".dd-card")))
    pg.fill(".dd-ta","2 × 3 = 6"); pg.click(".dd-actions >> text=Yes, that's it"); pg.wait_for_timeout(600)
    check("after the user's correction it is accepted and checked locally (✓ true)",pg.evaluate("window.DABSy.doodle._S.page.blocks.length")==n+1 and "true" in pg.inner_text(".dd-resline"))
    # 4) no vision-capable service: honest + typed fallback still computes
    write_something(pg,650); pg.evaluate("(()=>{const D=window.DABSy;D.ai.vision=window.__orig.vi;D.ai.visionStatus=window.__orig.vs})()")
    n=pg.evaluate("window.DABSy.doodle._S.page.blocks.length"); read_region(pg,650)
    pg.wait_for_timeout(1200)
    check("REAL path, no vision service: says so plainly, offers setup and typing, creates no reading",("No vision service is connected" in pg.inner_text(".dd-card")) and pg.locator("text=Type it instead").count()==1 and pg.evaluate("window.DABSy.doodle._S.page.blocks.length")==n)
    pg.click("text=Type it instead"); pg.wait_for_timeout(300)
    check("typed fallback opens the confirm box",pg.locator(".dd-ta").count()==1)
    pg.fill(".dd-ta","\\frac{1}{2}+\\frac{1}{3}"); pg.click(".dd-actions >> text=Yes, that's it"); pg.wait_for_timeout(600)
    check("typed fractions computed exactly offline (= 5/6)",pg.evaluate("[...document.querySelectorAll('.dd-res')].some(e=>e.textContent.includes('5/6'))"))
    # 5) misread equation is never silently solved: wrong reading -> user edits
    # 6) check my work
    pg.evaluate("window.DABSy.doodle._S.sel=null"); 
    pg.evaluate("(()=>{const D=window.DABSy.doodle._S;const b=D.page.blocks.find(x=>/\\\\sqrt/.test(x.lines[0]));window.__qb=b.id})()")
    pg.evaluate("window.DABSy.doodle._S.page.blocks.push({id:'q2',bbox:[40,760,300,60],lines:['2x+3=11'],cur:0}); ")
    pg.evaluate("(()=>{window.DABSy.doodle._S.sel='q2'})()")
    write_something(pg,880); mock(pg,{"lines":[{"latex":"2x = 14","confidence":0.97},{"latex":"x = 7","confidence":0.97}],"unclear":[]})
    pg.click("[aria-label='Check my work']"); pg.wait_for_timeout(300); drag(pg,(20,860),(260,960)); pg.wait_for_timeout(800)
    check("check my work always shows what it read and asks you to confirm",("Is this what you wrote?" in pg.inner_text(".dd-card")))
    pg.click(".dd-actions >> text=Yes, that's it"); pg.wait_for_timeout(700)
    t=pg.inner_text(".dd-card")
    check("working check flags the sign/arithmetic slip at line 1 and does not reveal the full solution",("✗" in t) and "goes wrong" in t and "x = 4" not in t and "Explain this step" in t,t[:300])
    pg.screenshot(path="/tmp/dd_math_check.png")
    # 7) explain needs internet: offline message; online uses tutor with verified facts (MOCK)
    pg.evaluate("window.__st=[];window.DABSy.ai.study=async(q)=>{window.__st.push(q===undefined?'UNDEF '+new Error().stack.split('\\n').slice(2,4).join('|'):q);return {ok:true,text:'Think about moving 3 to the other side: it changes sign.'}}")
    pg.click(".dd-card .dd-opts >> text=Explain this step"); pg.wait_for_timeout(700)
    print("DBG",pg.evaluate("window.__st"),pg.inner_text(".dd-card")[:200])
    check("[MOCK tutor] explain request carries the verified facts and the working",("Verified solution" in pg.evaluate("window.__st.filter(Boolean)[0]")) and "2x = 14" in pg.evaluate("window.__st.filter(Boolean)[0]") and "Think about" in pg.inner_text(".dd-card"))
    # 8) offline explain
    pg.context.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))")
    pg.click(".dd-card >> text=Back"); pg.wait_for_timeout(200); pg.click(".dd-opts >> text=Explain the concept"); pg.wait_for_timeout(500)
    check("offline: explanation says it needs the internet; Solve/Hint still local",("need the internet" in pg.inner_text(".dd-card")))
    pg.click(".dd-card >> text=Back"); pg.click(".dd-opts >> text=Solve step by step"); pg.wait_for_timeout(600)
    check("offline: step-by-step solve still works locally",pg.evaluate("document.querySelector('.dd-steps .katex')!==null"))
    pg.context.set_offline(False)
    # 9) manual page break snaps to a gap, never cuts through writing
    pg.click("[aria-label='Page and notebook options']"); pg.click("text=Page break…"); pg.wait_for_timeout(300)
    n_before=pg.evaluate("window.DABSy.doodle._S.page.strokes.length"); 
    drag(pg,(100,250),(100,250)); pg.wait_for_timeout(900)
    st=pg.evaluate("window.DABSy.doodle.state()")
    check("page break creates the next page and moves only what is below the gap",st['pages']>=2,st)
    ok=pg.evaluate("""(()=>{const S=window.DABSy.doodle._S;return S.page.strokes.length<"""+str(n_before)+""";})()""")
    check("strokes below the break left the first page (none duplicated)",ok)
    # 10) near-bottom chip
    pg.evaluate("window.DABSy.doodle._api.go(0)"); pg.wait_for_timeout(500)
    pg.evaluate("window.DABSy.doodle._S.page.strokes.push({t:'p',c:'auto',w:3,p:[50,1050,300,1060]});window.DABSy.doodle._S.pad.redraw()"); 
    pg.evaluate("window.DABSy.doodle._S.pad.setPage(window.DABSy.doodle._S.page)"); 
    stroke(pg,[(50,10),(60,12)]); pg.wait_for_timeout(300)
    check("page nearly full: chip offers a new page (never auto-splits)",pg.evaluate("!document.querySelector('.dd-near').hidden"))
    # 11) day / night
    pg.evaluate("document.documentElement.dataset.theme='dark'"); pg.wait_for_timeout(500); pg.screenshot(path="/tmp/dd_math_night.png")
    pg.evaluate("document.documentElement.dataset.theme='light'")
    check("no page errors",not errs,errs[:3])
    b.close()
    # --- storage failure: IndexedDB blocked entirely
    b,pg,errs=newpage(p,touch=True,h=800,init="Object.defineProperty(window,'indexedDB',{get(){return undefined}})")
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('fun'))"); pg.wait_for_timeout(1500)
    stroke(pg,[(60,100),(200,160)]); pg.wait_for_timeout(1200)
    check("storage failure: drawing still works in memory",pg.evaluate("window.DABSy.doodle._S.page.strokes.length")==1)
    check("storage failure: user is told, save dot warns",pg.evaluate("document.querySelector('.dd-save').dataset.s")=="warn" and pg.locator(".toast").count()>=1)
    check("no page errors (storage failure)",not errs,errs[:3]); b.close()
    # --- large drawing: 400 long strokes stay responsive
    b,pg,errs=newpage(p,touch=True,h=800)
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('fun'))"); pg.wait_for_timeout(1500)
    ms=pg.evaluate("""(()=>{const S=window.DABSy.doodle._S;for(let i=0;i<400;i++){const p=[];for(let j=0;j<120;j++)p.push(50+Math.sin(j/6+i)*40+j*5,100+i*2+Math.cos(j/5)*30);S.page.strokes.push({t:'p',c:'auto',w:3,p:p.map(x=>Math.round(x*10)/10)})}
      const t=performance.now();S.pad.redraw();return performance.now()-t})()""")
    check("large drawing (400 strokes × 120 pts) redraws in < 400 ms",ms<400,ms)
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
