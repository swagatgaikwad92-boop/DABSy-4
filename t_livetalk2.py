# v12.1 Live Talk: no image, pause-tolerant listening, no keypad after a reply. Speech recognition is MOCKED (real mic can't run headless).
from harness import *
srv=serve()
INIT="""window.__rec=null;window.webkitSpeechRecognition=window.SpeechRecognition=function(){window.__rec=this;this.started=0;
this.start=function(){this.started++;window.__starts=(window.__starts||0)+1;this.continuous_seen=this.continuous;this.interim_seen=this.interimResults;setTimeout(()=>this.onstart&&this.onstart(),20)};
this.stop=function(){setTimeout(()=>this.onend&&this.onend(),20)};this.abort=this.stop};"""
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True,init=INIT,h=800)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("""()=>{const D=window.DABSy;D.permissions.ensure=async()=>({granted:true});window.__heard=[];D.bus.on('voice:heard',e=>window.__heard.push(e.text));D.memory.getSettings().speakReplies=false}""")
    st=lambda:pg.evaluate("document.getElementById('live-talk').dataset.state")
    # open chat (keyboard up) then start live talk
    pg.evaluate("window.DABSy.app.openCommand()"); pg.wait_for_timeout(500)
    pg.click("#live-btn"); pg.wait_for_timeout(600)
    check("no <img> in the Live Talk card",pg.locator("#live-talk img").count()==0)
    check("no character/layer elements",pg.locator(".lt-layers,.lt-single,.lt-halo").count()==0)
    check("chat input is not focused while Live Talk is open (no keypad)",pg.evaluate("document.activeElement!==document.getElementById('text-input')"))
    check("recognition was started in continuous+interim mode",pg.evaluate("window.__rec.continuous_seen===true && window.__rec.interim_seen===true"))
    check("state is listening and mic badge on",st()=="listening" and pg.evaluate("document.getElementById('live-talk').dataset.mic")=="on")
    # user speaks, pauses 1s mid-sentence, continues
    emit=lambda t:pg.evaluate("t=>window.DABSy.bus.emit('voice:interim',{text:t})",t)
    emit("what is the"); pg.wait_for_timeout(1000)
    check("1 s pause mid-sentence: still listening, nothing sent",st()=="listening" and pg.evaluate("window.__heard.length")==0,st())
    emit("what is the derivative of x squared"); pg.wait_for_timeout(1000)
    check("keeps listening while the user keeps talking",st()=="listening" and pg.evaluate("window.__heard.length")==0)
    pg.wait_for_timeout(1100)
    check("after ~1.7 s of silence the whole sentence is sent once",pg.evaluate("window.__heard")==["what is the derivative of x squared"],pg.evaluate("window.__heard"))
    check("then DABSy is thinking",st() in("thinking","speaking","listening"))
    # reply arrives: keypad must not pop
    pg.evaluate("window.DABSy.app.showSubtitle('Two x.')"); pg.wait_for_timeout(2500)
    check("after the reply the text input is NOT focused (no keypad)",pg.evaluate("document.activeElement!==document.getElementById('text-input')"))
    check("after the reply Live Talk returns to listening (flow continues)",pg.wait_for_function("document.getElementById('live-talk').dataset.state==='listening'",timeout=8000) is not None)
    # browser ends the session right after speech: pending text still sent
    n0=pg.evaluate("window.__heard.length")
    emit("define velocity"); pg.evaluate("window.__rec.onend()"); pg.wait_for_timeout(300)
    check("session ended by the browser right after speech: text is sent, not lost",pg.evaluate("window.__heard.length")==n0+1 and pg.evaluate("window.__heard.slice(-1)[0]")=="define velocity",pg.evaluate("window.__heard"))
    # normal typed chat still refocuses (keyboard stays for typing)
    pg.click(".lt-actions .primary"); pg.wait_for_timeout(300)
    pg.evaluate("window.DABSy.app.openCommand()"); pg.wait_for_timeout(300)
    pg.fill("#text-input","hello"); pg.evaluate("document.getElementById('text-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))")
    pg.wait_for_timeout(2500)
    check("typed messages still keep the field focused (unchanged behaviour)",pg.evaluate("document.activeElement===document.getElementById('text-input')"))
    check("no page errors",not errs,errs[:3])
    pg.screenshot(path="/tmp/lt2.png"); b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
