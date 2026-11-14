from harness import *
srv=serve()
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,init="try{Object.defineProperty(CSS,'supports',{value:(a,b)=>String(a).indexOf('field-sizing')>=0?false:true})}catch(e){}\nwindow.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#text-input{field-sizing:fixed!important}';document.head.append(s)});")
    pg.evaluate("window.DABSy.app.openCommand()"); pg.wait_for_timeout(600)
    ta=pg.locator("#text-input"); ta.fill("a"); pg.wait_for_timeout(120); h1=ta.bounding_box()["height"]
    ta.fill("\n".join(str(i) for i in range(4))); pg.wait_for_timeout(150); h4=ta.bounding_box()["height"]
    ta.fill("\n".join(str(i) for i in range(15))); pg.wait_for_timeout(150); h15=ta.bounding_box()["height"]
    check("JS fallback (no field-sizing) grows with text",h4>h1+40,(h1,h4))
    check("JS fallback caps at about five lines",h15<=140 and h15>=100,h15)
    ta.fill(""); pg.wait_for_timeout(150); check("JS fallback shrinks back",ta.bounding_box()["height"]<=h1+2)
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
