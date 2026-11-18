# v12.1.2 VISION PIPELINE (capture -> encode -> HTTP -> Worker code -> provider-shaped request -> reply -> DABSy UI).
# The 'model' is a PIXEL-FACTS STAND-IN (stub_gemini.py), NOT a vision model. This proves the picture arrives intact and the app gates on a real
# read-back test. It does NOT prove that any real model recognises cats or handwriting — that needs your deployed Worker (see VISION_SETUP.md).
import subprocess, time, os, sys, json, glob, shutil
sys.path.insert(0, os.path.dirname(__file__)); import drawings as DR
from harness import *
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
shutil.rmtree("/tmp/e2e_received", ignore_errors=True)
stub=subprocess.Popen([sys.executable,os.path.join(os.path.dirname(__file__),"stub_gemini.py")])
node=subprocess.Popen(["node",os.path.join(os.path.dirname(__file__),"vision_e2e_server.mjs")],stdout=subprocess.PIPE)
class Liar(BaseHTTPRequestHandler):                       # a TEXT-ONLY service: ignores the picture and always claims "red, 7"
    def log_message(self,*a): pass
    def do_OPTIONS(self): self.send_response(204); [self.send_header(k,v) for k,v in(("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","Content-Type"),("Access-Control-Allow-Methods","POST"))]; self.end_headers()
    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"])); self.send_response(200); self.send_header("Access-Control-Allow-Origin","*"); self.send_header("Content-Type","application/json"); self.end_headers()
        self.wfile.write(json.dumps({"reply":'{"circle_colour":"red","digit":"7"}'}).encode())
liar=HTTPServer(("127.0.0.1",8796),Liar); threading.Thread(target=liar.serve_forever,daemon=True).start()
node.stdout.readline(); time.sleep(1.0); srv=serve()
def dense(pl,step=5):                                   # real finger strokes have a point every few px; densify the sparse test polylines the same way
    out=[pl[0]]
    for a,b in zip(pl,pl[1:]):
        n=max(1,int(((b[0]-a[0])**2+(b[1]-a[1])**2)**.5//step))
        out+=[(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n) for i in range(1,n+1)]
    return out
def put(pg,strokes,clear=True):
    strokes=[dense(pl) for pl in strokes]
    pg.evaluate("""([ss,clear])=>{const S=window.DABSy.doodle._S;const pg=S.page;if(clear){pg.strokes.length=0;pg.blocks.length=0}
      ss.forEach(p=>pg.strokes.push({t:'p',c:'auto',w:5,p:p.flat().map(v=>Math.round(v*10)/10)}));S.pad.setPage(pg);S.saved=false}""",[[[list(pt) for pt in pl] for pl in strokes],clear])
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,h=800)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('fun'))"); pg.wait_for_timeout(1500)
    # --- 0. the REAL default state: nothing connected -> honest, and NOTHING is sent
    sent=[]; pg.on("request",lambda r: sent.append(r.url) if "generativelanguage" in r.url or ":8797" in r.url else None)
    put(pg,DR.cat()); pg.click("[aria-label='Ask DABSy']"); pg.wait_for_timeout(1800)
    check("default (no vision service): setup card, honest reason, no analysis claimed",("No vision service is connected" in pg.inner_text(".dd-card")) and "STANDIN" not in pg.inner_text(".dd-card"))
    check("the user's drawing was NOT sent anywhere (only a synthetic test picture may have gone to the main Worker)",not any(":8797" in u for u in sent))
    # --- 1. a service that ignores pictures is caught
    pg.fill("input[aria-label='Vision service address']","http://127.0.0.1:8796"); 
    fails=0
    for i in range(4):
        pg.click("text=Connect and test"); pg.wait_for_timeout(900)
        if "ignoring images" in pg.inner_text(".dd-vsetup") or "without actually seeing" in pg.inner_text(".dd-vsetup"): fails+=1
    check("a text-only service that fakes an answer is detected (>=3 of 4 random probes)",fails>=3,fails)
    # --- 2. real pipeline against the Worker code + stand-in
    pg.fill("input[aria-label='Vision service address']","http://127.0.0.1:8797"); pg.click("text=Connect and test"); pg.wait_for_timeout(2500)
    check("probe passes through browser -> Worker -> provider-shaped request (random colour+digit read back)",("I can see pictures" in pg.inner_text(".dd-card")) and pg.evaluate("window.DABSy.ai.visionStatus().ok")==True,pg.inner_text(".dd-card")[:200])
    pg.evaluate("document.querySelector('.dd-card').hidden=true")
    def ask(label):
        n0=len(glob.glob("/tmp/e2e_received/*")); pg.click("[aria-label='Ask DABSy']"); pg.wait_for_timeout(2500)
        t=pg.inner_text(".dd-bubble"); n1=len(glob.glob("/tmp/e2e_received/*"))
        check(f"[{label}] exactly one picture reached the provider-shaped endpoint and was decodable",n1==n0+1 and "received a valid" in t,t[:160]); return t
    t=ask("cat"); shutil.copy(sorted(glob.glob("/tmp/e2e_received/*"))[-1],"/tmp/vis_cat.jpg"); check("[cat] bubble shows the (stand-in) reply, not an invented description","STANDIN" in t)
    pg.fill(".dd-binp","what colour is it?"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2200)
    check("follow-up question re-sends the picture and gets a reply",len(glob.glob("/tmp/e2e_received/*"))>=3 and "STANDIN" in pg.inner_text(".dd-bubble"))
    shots={}
    for name,fn in [("house_tree",DR.house_tree),("sentence",DR.sentence),("geometry",DR.geometry),("vectors",DR.vectors)]:
        put(pg,fn()); before=sorted(glob.glob("/tmp/e2e_received/*"))[-1]; ask(name); shots[name]=sorted(glob.glob("/tmp/e2e_received/*"))[-1]
        shutil.copy(shots[name],f"/tmp/vis_{name}."+shots[name].split(".")[-1])
    shutil.copy(sorted(glob.glob("/tmp/e2e_received/*"))[2],"/tmp/vis_cat.jpg") if False else None
    shutil.copy(sorted(glob.glob("/tmp/e2e_received/*"))[0],"/tmp/vis_probe."+sorted(glob.glob("/tmp/e2e_received/*"))[0].split(".")[-1])
    # --- 3. maths: capture pipeline only (the stand-in cannot read handwriting)
    pg.evaluate("window.DABSy.doodle.close()"); pg.wait_for_timeout(500)
    pg.evaluate("window.DABSy.require('doodle').then(m=>m.open('maths'))"); pg.wait_for_timeout(1500)
    for name,fn in [("m_1plus2",DR.maths_1plus2),("m_quad",DR.maths_quad),("m_fraction",DR.maths_fraction),("m_sqrt",DR.maths_sqrt)]:
        put(pg,fn()); pg.click("[aria-label='Recognise what I wrote']"); pg.wait_for_timeout(300)
        pg.evaluate("""()=>{const v=document.querySelector('.dd-view');const r=v.getBoundingClientRect();const ev=(t,x,y)=>v.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:'mouse',clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true,button:0,isPrimary:true}));ev('pointerdown',4,4);ev('pointermove',200,300);ev('pointermove',r.width-4,r.height-100);ev('pointerup',r.width-4,r.height-100)}""")
        pg.wait_for_timeout(2500)
        got=sorted(glob.glob("/tmp/e2e_received/*"))[-1]; shutil.copy(got,f"/tmp/vis_{name}.png")
        txt=pg.inner_text(".dd-card")
        check(f"[{name}] region captured as PNG and sent; non-JSON reply handled honestly (asks you to type/confirm, invents nothing)",got.endswith(".png") and ("couldn't read anything mathematical" in txt or "I need your help reading this" in txt) and pg.evaluate("window.DABSy.doodle._S.page.blocks.length")==0,txt[:140])
        pg.evaluate("document.querySelector('.dd-card').hidden=true")
    check("no page errors",not errs,errs[:3]); b.close()
finally:
  srv.terminate(); node.terminate(); stub.terminate(); liar.shutdown()
import sys; sys.exit(0 if summary() else 1)
