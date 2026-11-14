from harness import *
import json
SOL = r"""Given: $m = 2\,\mathrm{kg}$, $\vec{F} = 10\,\mathrm{N}$ along the $x$-axis. Force is a vector; mass is a scalar.
Find: the acceleration $\vec{a}$.
Concept: Newton's second law links the net force to the acceleration, because the mass is constant here.
Formula:
$$\vec{F} = m\vec{a}$$
Substitute: $a = \frac{10\,\mathrm{N}}{2\,\mathrm{kg}}$
Solve:
$$a = 5\,\mathrm{m\,s^{-2}}$$
Check: $\mathrm{N} = \mathrm{kg\,m\,s^{-2}}$, so $\frac{\mathrm{N}}{\mathrm{kg}} = \mathrm{m\,s^{-2}}$. Units agree.
Answer: $\vec{a} = 5\,\hat{i}\ \mathrm{m\,s^{-2}}$ and the reaction is $\ce{2H2 + O2 -> 2H2O}$, with $x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$."""
srv=serve()
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True)
    calls=[]
    def handler(route):
        body=json.loads(route.request.post_data or "{}")
        msg=body.get("message","")
        calls.append(msg)
        if "RECHECK" in msg: reply="Verified: the answer is consistent.\nAnswer: $a = 5\\,\\mathrm{m\\,s^{-2}}$"
        elif "Student:" in msg and ("force" in msg.lower() or "newton" in msg.lower()): reply=SOL
        else: reply="Sure, I can help with that."
        route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps({"reply":reply}))
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev/**",handler)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev",handler)
    pg.evaluate("window.DABSy.memory.getSettings().speakReplies=false")
    # classifier
    cls=pg.evaluate("""()=>['A 2 kg block feels a 10 N force. Find the acceleration.','explain newton second law','why is the sky blue?','remind me to study at 6pm','plan my day','hi','open study space','what is the mole concept','thanks','what is my schedule tomorrow','derive v^2=u^2+2as','how are you?','add a task to revise chemistry'].map(t=>[t,window.DABSy.study.classify(t)])""")
    want={'A 2 kg block feels a 10 N force. Find the acceleration.':'study','explain newton second law':'study','why is the sky blue?':'study','remind me to study at 6pm':'other','plan my day':'other','hi':'other','open study space':'other','what is the mole concept':'study','thanks':'other','what is my schedule tomorrow':'other','derive v^2=u^2+2as':'study','how are you?':'other','add a task to revise chemistry':'other'}
    bad=[(t,c) for t,c in cls if want[t]!=c]
    check("study/other classifier",not bad,bad)
    # study block ON, ask a numerical
    pg.evaluate("window.DABSy.studyBlock.activate()"); pg.wait_for_timeout(900)
    pg.evaluate("window.DABSy.app.handleUserUtterance('A 2 kg block feels a 10 N force. Find the acceleration using Newton second law')")
    pg.wait_for_selector("#projection-content .st-body .katex",timeout=15000); pg.wait_for_timeout(500)
    n=pg.locator("#projection-content .katex").count()
    check("equations rendered by KaTeX",n>=8,n)
    check("no raw $ or \\frac left in rendered answer",not any(x in pg.inner_text("#projection-content .st-body") for x in ["$","\\frac","\\vec","\\mathrm"]),pg.inner_text("#projection-content .st-body")[:200])
    check("fraction element present",pg.locator("#projection-content .katex .mfrac").count()>=2)
    check("vector arrow present",pg.locator("#projection-content .katex .accent").count()>=1)
    check("chemistry \\ce rendered (mhchem)",pg.locator("#projection-content .mx-raw").count()==0 and "H" in pg.inner_text("#projection-content .st-body"))
    check("step labels shown",pg.locator("#projection-content .mx-tag").count()>=7,pg.locator("#projection-content .mx-tag").all_inner_texts())
    check("no control chars / junk in answer",not any(ord(c)<9 or 11<=ord(c)<32 for c in pg.inner_text("#projection-content")))
    sys_prompt=[c for c in calls if "ABSOLUTE RULES" in c]
    check("tutor prompt sent with rules + the student's exact words",bool(sys_prompt) and "2 kg block" in sys_prompt[0] and "LaTeX" in sys_prompt[0])
    check("study request is plain text (not JSON-wrapped)",bool(sys_prompt) and 'Reply with ONLY JSON' not in sys_prompt[0])
    # recheck
    pg.locator("#projection-content .st-actions button",has_text="Recheck").first.click(); pg.wait_for_timeout(1500)
    check("recheck asks model to re-solve independently",any("RECHECK" in c for c in calls))
    check("recheck result shown",pg.locator("#projection-content .st-group").count()==2)
    # follow-up stays on surface with history
    pg.fill("#st-follow textarea","I still don't understand why mass is a scalar"); pg.press("#st-follow textarea","Control+Enter") if False else pg.evaluate("document.getElementById('st-follow').requestSubmit()"); pg.wait_for_timeout(1500)
    last=[c for c in calls if "still don't understand" in c]
    check("follow-up carries history + confusion flag",bool(last) and "Conversation so far" in last[-1] and "different approach" in last[-1])
    # non-study message from inside surface returns to normal DABSy
    pg.fill("#st-follow textarea","remind me to drink water at 5pm"); pg.evaluate("document.getElementById('st-follow').requestSubmit()"); pg.wait_for_timeout(1200)
    check("non-study follow-up closes surface (not trapped in Study Mode)",not pg.evaluate("document.getElementById('projection').classList.contains('open')"))
    # Study block still on; non-study utterance goes to normal pipeline (not explained)
    n0=len(calls)
    pg.evaluate("window.DABSy.app.handleUserUtterance('open study space')"); pg.wait_for_timeout(800)
    check("'open study space' works while Study Block is on",pg.evaluate("window.DABSy.ecosystem.isOpen()"))
    check("no tutor call made for it",not any("ABSOLUTE RULES" in c for c in calls[n0:]))
    check("no page errors",not errs,errs[:3])
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
