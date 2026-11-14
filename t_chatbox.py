from harness import *
srv=serve()
try:
  with sync_playwright() as p:
    for touch in (True,False):
      b,pg,errs=newpage(p,touch=touch)
      pg.evaluate("window.DABSy.app.openCommand()"); pg.wait_for_timeout(600)
      ta=pg.locator("#text-input")
      ta.fill("one"); pg.wait_for_timeout(100)
      h1=ta.bounding_box()["height"]
      check(f"[touch={touch}] send button appears with text", pg.locator("#send-btn").is_visible())
      ta.fill("\n".join(["line %d"%i for i in range(3)])); pg.wait_for_timeout(150)
      h3=ta.bounding_box()["height"]
      check(f"[touch={touch}] grows with 3 lines",h3>h1+30,(h1,h3))
      ta.fill("\n".join(["line %d"%i for i in range(12)])); pg.wait_for_timeout(150)
      h12=ta.bounding_box()["height"]; sh=pg.evaluate("document.getElementById('text-input').scrollHeight")
      check(f"[touch={touch}] caps near five lines and scrolls internally",h12<=140 and sh>h12,(h12,sh))
      box=pg.locator("#input-dock").bounding_box()
      check(f"[touch={touch}] dock stays on screen",box["y"]>0 and box["y"]+box["height"]<=800,box)
      check(f"[touch={touch}] send button still visible when capped",pg.locator("#send-btn").is_visible())
      pg.evaluate("window.__sent=[];const o=window.DABSy.bus.emit;window.DABSy.bus.emit=function(n,d){if(n==='user:said')window.__sent.push(d.text);return o.apply(this,arguments)}")
      ta.fill("hello there"); 
      if touch:
        ta.press("Enter"); pg.wait_for_timeout(100)
        check("touch: Enter adds a new line (does not send)",pg.evaluate("window.__sent.length")==0 and "\n" in ta.input_value())
        pg.locator("#send-btn").click(); pg.wait_for_timeout(400)
        check("touch: Send button sends",pg.evaluate("window.__sent.length")==1)
      else:
        ta.press("Shift+Enter"); ta.type("x"); 
        check("desktop: Shift+Enter makes a new line",pg.evaluate("window.__sent.length")==0 and "\n" in ta.input_value())
        ta.fill("hello there"); ta.press("Enter"); pg.wait_for_timeout(400)
        check("desktop: Enter sends",pg.evaluate("window.__sent.length")==1)
      check(f"[touch={touch}] box resets after send",ta.bounding_box()["height"]<h1+8 and ta.input_value()=="",ta.bounding_box())
      check(f"[touch={touch}] no page errors",not errs,errs)
      b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
