from harness import *
import sys, datetime
srv=serve()
try:
  with sync_playwright() as p:
    for theme in ("light","dark"):
      b,pg,errs=newpage(p,touch=True,h=800,init=f"localStorage.setItem('dabsy_settings',JSON.stringify({{theme:'{theme}',form:'classic'}}));")
      pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
      pg.evaluate("()=>{const w=window.DABSy.widgets;['clock','date','tasks','weather'].forEach(i=>w.add(i));w.openChooser();}"); pg.wait_for_timeout(500); pg.mouse.click(200,790); pg.wait_for_timeout(5500)
      pg.evaluate("document.body.classList.remove('lite-gfx')"); pg.wait_for_timeout(600); pg.screenshot(path=f"/tmp/shots/home_{theme}.png")
      pg.evaluate("window.DABSy.app.openCommand()"); pg.wait_for_timeout(900)
      pg.fill("#text-input","Explain Newton's second law\nand give one example"); pg.wait_for_timeout(400)
      pg.screenshot(path=f"/tmp/shots/chat_{theme}.png")
      print(theme,errs[:2], pg.evaluate("document.documentElement.dataset.theme"))
      b.close()
finally: srv.terminate()
