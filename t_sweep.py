from harness import *
srv=serve()
try:
  with sync_playwright() as p:
    for theme in ("light","dark"):
      for form in ("classic","magic"):
        b,pg,errs=newpage(p,touch=True,h=800,init=f"localStorage.setItem('dabsy_settings',JSON.stringify({{theme:'{theme}',form:'{form}'}}));")
        pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
        pg.wait_for_timeout(1500)
        for step in ["window.DABSy.app.openCommand()","window.DABSy.app.closeCommand()","window.DABSy.widgets.openChooser()","(document.getElementById('bell-btn')||{click(){}}).click()"]:
            try: pg.evaluate(step)
            except Exception as e: errs.append("eval:"+str(e)[:80])
            pg.wait_for_timeout(500); pg.mouse.click(190,790); pg.wait_for_timeout(300)
        check(f"[{theme}/{form}] boots and opens chat/chooser/notifications without errors",not errs,errs[:3])
        pg.screenshot(path=f"/tmp/shots/sweep_{theme}_{form}.png")
        b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
