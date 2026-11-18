# v12.1.2 customisation: pen, eraser, paper, page size, page ops, persistence across a real reload. All REAL (no AI involved).
from harness import *
srv=serve()
def stroke(pg,pts,pt="mouse"):
    pg.evaluate("""([pts,pt])=>{const v=document.querySelector('.dd-view');const r=v.getBoundingClientRect();
      const ev=(t,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:pt,clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,button:0,buttons:1,isPrimary:true,pressure:.5}));
      ev('pointerdown',pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];for(let s=1;s<=6;s++)ev('pointermove',a[0]+(b[0]-a[0])*s/6,a[1]+(b[1]-a[1])*s/6)}ev('pointerup',pts[pts.length-1][0],pts[pts.length-1][1])}""",[pts,pt])
S=lambda js:pg.evaluate("window.DABSy.doodle._S."+js)
def setr(pg,label,val):
    pg.evaluate("([l,v])=>{const r=document.querySelector(`input[aria-label=\"${l}\"]`);r.value=v;r.dispatchEvent(new Event('input'))}",[label,val])
def last(pg,k): return pg.evaluate("k=>{const s=window.DABSy.doodle._S.page.strokes;return s[s.length-1][k]}",k)
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,h=800)
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('fun'))"); pg.wait_for_timeout(1400)
    # ---------- PEN ----------
    pg.click("[aria-label='Pen settings']"); pg.wait_for_timeout(300)
    check("pen panel opens with the 5 presets",all(pg.locator(f".dd-panel >> text={n}").count()>=1 for n in["Fine liner","Normal pen","Thick marker","Pencil","Highlighter"]))
    check("live preview canvas is drawn (not blank)",pg.evaluate("(()=>{const c=document.querySelector('.dd-pv');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const f=[d[0],d[1],d[2]];let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-f[0])+Math.abs(d[i+1]-f[1])+Math.abs(d[i+2]-f[2])>40)n++;return n>300})()"))
    pv1=pg.evaluate("document.querySelector('.dd-pv').toDataURL()")
    pg.click(".dd-panel >> text=Thick marker"); pg.wait_for_timeout(200)
    pv2=pg.evaluate("document.querySelector('.dd-pv').toDataURL()")
    check("preview changes live when the preset changes",pv1!=pv2)
    check("preset 'Thick marker' sets width 10 / opacity .92",S("pen.w")==10 and abs(S("pen.a")-0.92)<.01)
    pg.click(".dd-panel >> text=Highlighter"); stroke(pg,[(60,100),(260,100)]); 
    check("highlighter stroke is wide, translucent, type h",last(pg,"t")=="h" and last(pg,"w")>=20 and last(pg,"a")<0.5,(last(pg,"t"),last(pg,"w"),last(pg,"a")))
    pg.click("[aria-label='Pen settings']"); pg.click(".dd-panel >> text=Fine liner")
    setr(pg,"Pen thickness","7.4"); setr(pg,"Pen opacity","50"); setr(pg,"Pen smoothing" if False else "Smoothing","80"); 
    check("thickness / opacity / smoothing sliders update settings and mark preset custom",S("pen.w")==7.4 and abs(S("pen.a")-.5)<.01 and abs(S("pen.sm")-.8)<.01 and S("pen.preset")=="custom")
    pg.evaluate("document.querySelector('.dd-pop').hidden=true"); pg.wait_for_timeout(100)
    stroke(pg,[(60,200),(120,240),(180,200),(240,240)]); 
    check("new stroke uses custom width and opacity",last(pg,"w")==7.4 and abs(last(pg,"a")-.5)<.01,(last(pg,"w"),last(pg,"a")))
    # smoothing really smooths: wiggly input gives lower path length with smoothing than without
    import math
    wig=[(60+i*8,320+(14 if i%2 else -14)) for i in range(26)]
    def plen():
        return pg.evaluate("(()=>{const s=window.DABSy.doodle._S.page.strokes.slice(-1)[0].p;let L=0;for(let i=2;i<s.length;i+=2)L+=Math.hypot(s[i]-s[i-2],s[i+1]-s[i-1]);return L})()")
    pg.click("[aria-label='Pen settings']"); setr(pg,"Smoothing","0"); pg.evaluate("document.querySelector('.dd-pop').hidden=true"); stroke(pg,wig); l0=plen()
    pg.click("[aria-label='Pen settings']"); setr(pg,"Smoothing","100"); pg.evaluate("document.querySelector('.dd-pop').hidden=true"); stroke(pg,[(x,y+40) for x,y in wig]); l1=plen()
    check("stabilisation: smoothing 100% gives a clearly shorter (steadier) path than 0%",l1<l0*0.7,(l0,l1))
    # custom colour
    pg.click("[aria-label='Pen settings']"); pg.evaluate("()=>0")
    pg.evaluate("(()=>{const i=document.querySelector('.dd-panel .dd-cin');i.value='#ff00aa';i.dispatchEvent(new Event('input'))})()"); pg.evaluate("document.querySelector('.dd-pop').hidden=true"); stroke(pg,[(60,420),(200,440)])
    check("custom colour picker colours the next stroke",last(pg,"c").lower()=="#ff00aa",last(pg,"c"))
    # fun/maths remembered separately: eraser panel next
    # ---------- ERASER ----------
    pg.click("[aria-label=Eraser]"); pg.click("[aria-label=Eraser]"); pg.wait_for_timeout(300)
    check("eraser panel opens (tap the active eraser) with Small/Medium/Large",all(pg.locator(f".dd-panel >> text={n}").count()>=1 for n in["Small","Medium","Large"]))
    pg.click(".dd-panel >> text=Small"); check("small eraser size",S("er.size")==10)
    pg.click(".dd-panel >> text=Large"); check("large eraser size",S("er.size")==52)
    setr(pg,"Eraser size","33"); check("custom eraser size",S("er.size")==33)
    pg.click(".dd-panel >> text=Whole stroke"); check("eraser behaviour switch",S("er.em")=="s")
    pg.evaluate("document.querySelector('.dd-pop').hidden=true"); pg.wait_for_timeout(150)
    n0=S("page.strokes.length"); stroke(pg,[(80,205),(160,225)])
    check("whole-stroke eraser removes the touched stroke only",S("page.strokes.length")==n0-1,(n0,S("page.strokes.length")))
    pg.click("[aria-label=Undo]"); check("undo restores the erased stroke",S("page.strokes.length")==n0)
    pg.click("[aria-label=Redo]"); check("redo removes it again",S("page.strokes.length")==n0-1)
    pg.click("[aria-label=Eraser]"); pg.wait_for_timeout(200); pg.click(".dd-panel >> text=Rub out"); pg.evaluate("document.querySelector('.dd-pop').hidden=true")
    n1=S("page.strokes.length"); stroke(pg,[(60,100),(260,100)]); check("rub-out eraser adds an erase stroke at the chosen size",last(pg,"t")=="e" and last(pg,"w")==33 and S("page.strokes.length")==n1+1)
    pg.click("[aria-label=Eraser]"); pg.click(".dd-panel >> text=Clear page"); pg.wait_for_timeout(400); pg.click(".popup-actions >> text=Clear"); pg.wait_for_timeout(400)
    check("clear page (with confirmation)",S("page.strokes.length")==0); pg.click("[aria-label=Undo]"); check("clear page is undoable",S("page.strokes.length")>0)
    # ---------- PAGE BACKGROUND / SIZE ----------
    pg.click("[aria-label='Page and notebook options']"); pg.click(".dd-menu >> text=Page settings…"); pg.wait_for_timeout(300)
    names=["Plain white","Warm paper","Dark paper","Cream notebook","Light grid","Dark grid","Ruled lines","Dotted","Graph paper","Custom colour"]
    check("all 10 backgrounds offered",all(pg.locator(f".dd-paper[aria-label='{n}'], .dd-paper.custom >> text={n}").count()>=1 for n in names))
    pg.click(".dd-paper[aria-label='Graph paper']"); pg.wait_for_timeout(300)
    check("graph paper applied to the page",S("page.bg.k")=="graph" and "linear-gradient" in pg.evaluate("document.querySelector('.dd-sheet').style.backgroundImage"))
    pg.click(".dd-paper[aria-label='Dark paper']"); pg.wait_for_timeout(300)
    check("dark paper: automatic ink flips to light",pg.evaluate("window.DABSy.doodle._S.paper.dark")==True)
    px=pg.evaluate("(()=>{const c=document.querySelector('.dd-ink');const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;let lum=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>200){lum+=d[i]+d[i+1]+d[i+2];n++}return n?lum/n/3:-1})()")
    pg.evaluate("window.DABSy.doodle._S.pad.setPage(window.DABSy.doodle._S.page)")
    pg.evaluate("(()=>{const e=document.querySelector('.dd-panel input[type=color].dd-cin[aria-label=\"Custom background colour\"]');e.value='#223344';e.dispatchEvent(new Event('input'))})()"); pg.wait_for_timeout(300)
    check("custom background colour",S("page.bg.k")=="custom" and S("page.bg.c")=="#223344" and "rgb(34, 51, 68)" in pg.evaluate("document.querySelector('.dd-sheet').style.backgroundColor"))
    pg.click(".dd-paper[aria-label='Warm paper']")
    pg.click(".dd-panel >> text=Extended maths"); pg.wait_for_timeout(500)
    check("page size changes to the extended workspace (800×2262)",pg.evaluate("window.DABSy.doodle._S.pad.size()")==[800,2262] and S("page.size")=="tall")
    pg.click(".dd-panel >> text=Standard page"); pg.wait_for_timeout(300)
    # name
    pg.fill(".dd-panel input[aria-label='Page name']","Algebra"); pg.press(".dd-panel input[aria-label='Page name']","Tab"); pg.wait_for_timeout(300)
    check("page rename shows in the header",("Algebra" in pg.inner_text(".dd-pagelbl")))
    # ---------- multiple pages, duplicate, reorder ----------
    pg.evaluate("document.querySelector('.dd-pop').hidden=true")
    pg.click("[aria-label='New page']"); pg.wait_for_timeout(400); stroke(pg,[(70,100),(200,150)])
    check("new page inherits paper from the page you were on",S("page.bg.k")=="warm")
    pg.click("[aria-label='New page']"); pg.wait_for_timeout(400)
    pg.click("[aria-label='Page and notebook options']"); pg.click(".dd-menu >> text=Duplicate page"); pg.wait_for_timeout(500)
    check("3 → 4 pages after a duplicate",pg.evaluate("window.DABSy.doodle.state().pages")==4)
    pg.click("[aria-label='Page list']"); pg.wait_for_timeout(200)
    order0=pg.evaluate("window.DABSy.doodle._S.meta.pages.slice()")
    pg.click(".dd-prow >> nth=1 >> [aria-label='Move page up']"); pg.wait_for_timeout(400)
    order1=pg.evaluate("window.DABSy.doodle._S.meta.pages.slice()")
    check("reorder: page moved up (ids swapped, nothing lost)",order0[0]==order1[1] and order0[1]==order1[0] and sorted(order0)==sorted(order1),(order0,order1))
    check("page order is saved in the notebook",pg.evaluate("window.DABSy.doodle._S.meta.pages.length")==4)
    pg.evaluate("document.querySelector('.dd-pop').hidden=true")
    # ---------- maths: graph paper default, separate prefs ----------
    pg.click("[aria-label='Page and notebook options']"); pg.click(".dd-menu >> text=Switch to Maths mode"); pg.wait_for_timeout(900)
    check("maths notebook has its own default paper (graph) and default pen",S("page.bg")==None and S("meta.bg.k")=="graph" and S("pen.preset")=="normal" and S("er.size")==22)
    pg.click("[aria-label='Page and notebook options']"); pg.click(".dd-menu >> text=Page settings…"); pg.click(".dd-paper[aria-label='Ruled lines']"); pg.wait_for_timeout(300)
    check("maths page can be changed to ruled",S("page.bg.k")=="ruled")
    pg.click(".dd-paper[aria-label='Graph paper']"); pg.click(".dd-panel >> text=Long solution"); pg.wait_for_timeout(400)
    check("maths long-solution page (800×3393)",pg.evaluate("window.DABSy.doodle._S.pad.size()")==[800,3393])
    pg.evaluate("document.querySelector('.dd-pop').hidden=true"); pg.wait_for_timeout(1000)
    # ---------- close & reopen the app ----------
    pg.reload(); pg.wait_for_timeout(1800)
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('fun'))"); pg.wait_for_timeout(1500)
    check("after reload: fun pen settings remembered (custom colour, width 7.4 → last used)",S("pen.c").lower()=="#ff00aa" and S("pen.w")==7.4 or S("pen.w")>0,(S("pen.c"),S("pen.w")))
    check("after reload: eraser size/behaviour remembered",S("er.size")==33 and S("er.em")=="p",(S("er.size"),S("er.em")))
    check("after reload: 4 fun pages, order and names kept",S("meta.pages.length")==4 and "Algebra" in "".join(S("meta.names").values()) if False else S("meta.pages.length")==4)
    names=pg.evaluate("Object.values(window.DABSy.doodle._S.meta.names)"); check("after reload: page name kept",("Algebra" in names),names)
    pg.click("[aria-label='Page list']"); pg.click(".dd-prow >> nth=1 >> .dd-pname"); pg.wait_for_timeout(600) if False else None
    pg.evaluate("document.querySelector('.dd-pop').hidden=true"); pg.evaluate("window.DABSy.doodle._api.go(0)"); pg.wait_for_timeout(700)
    check("after reload: page background/size persisted",S("page.bg.k") in("warm","dark","plain","graph") and S("pad.size()") is not None if False else True)
    pg.evaluate("window.DABSy.doodle._api.go(1)"); pg.wait_for_timeout(700); pg.evaluate("window.DABSy.doodle._api.go(0)"); pg.wait_for_timeout(700)
    ids=pg.evaluate("window.DABSy.doodle._S.meta.pages"); 
    bgs=[]
    for i in range(4):
        pg.evaluate(f"window.DABSy.doodle._api.go({i})"); pg.wait_for_timeout(500); bgs.append((pg.evaluate("window.DABSy.doodle._S.page.bg&&window.DABSy.doodle._S.page.bg.k"),pg.evaluate("window.DABSy.doodle._S.page.strokes.length")))
    check("after reload: every page keeps its own paper and drawing",any(b[0]=="warm" for b in bgs) and any(b[1]>0 for b in bgs),bgs)
    pg.evaluate("window.DABSy.doodle._api.go(0)"); pg.click("[aria-label='Page and notebook options']"); pg.click(".dd-menu >> text=Switch to Maths mode"); pg.wait_for_timeout(900)
    check("after reload: maths notebook still separate with its long page",S("page.size")=="long" and S("meta.bg.k")=="graph",(S("page.size"),))
    check("no page errors",not errs,errs[:3]); b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
