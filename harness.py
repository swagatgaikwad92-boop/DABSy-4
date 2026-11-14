import subprocess, time, os, sys, json
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT=8765
def serve():
    p=subprocess.Popen([sys.executable,"-m","http.server",str(PORT),"-d",ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    time.sleep(1); return p
URL=f"http://localhost:{PORT}/index.html"
results=[]
def check(name,cond,detail=""):
    results.append((name,bool(cond),detail)); print(("PASS " if cond else "FAIL ")+name+(" — "+str(detail) if detail and not cond else ""))
def newpage(p,theme=None,touch=True,w=390,h=800,init=None,clock=None):
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":w,"height":h},has_touch=touch,is_mobile=touch,device_scale_factor=2,service_workers="block")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m: errs.append("console:"+m.text) if m.type=="error" and "favicon" not in m.text and "Failed to load resource" not in m.text else None)
    pg.add_init_script("try{localStorage.setItem('dabsy_onboarding_v1',JSON.stringify({tutorialCompleted:true,outcome:'skipped'}))}catch(e){}")
    if init: pg.add_init_script(init)
    if clock:
        pg.clock.install(time=clock); pg.clock.resume()
    pg.goto(URL); pg.wait_for_timeout(1500)
    return b,pg,errs
def summary():
    f=[r for r in results if not r[1]]
    print(f"\n{len(results)-len(f)}/{len(results)} passed")
    return len(f)==0
