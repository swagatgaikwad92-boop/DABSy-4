# v11.3 step 1: execution foundation inside the REAL app (lazy-loaded via DABSy.require), real task-engine, real permissions-engine.
# Run: (cd dabsy && python3 -m http.server 8090 &) ; python3 tests/t15.py
import asyncio
from playwright.async_api import async_playwright
res=[]
def chk(n,ok,d=''): res.append((n,bool(ok))); print(('PASS' if ok else 'FAIL'),n,str(d)[:240])
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':800},has_touch=True,is_mobile=True)
    await ctx.add_init_script('localStorage.setItem("dabsy_onboarding_v1",JSON.stringify({tutorialCompleted:true}))')
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto('http://localhost:8090/index.html'); await pg.wait_for_timeout(2500)
    chk('app boots; execution is NOT loaded until asked (no cost to first paint)', await pg.evaluate('!DABSy.execution && !DABSy.capabilities'))
    ok=await pg.evaluate('DABSy.require("execution").then(x=>!!(x.createPlan&&x.validatePlan&&x.run&&x.cancel))')
    chk('DABSy.require("execution") exposes createPlan / validatePlan / run / cancel', ok)
    chk('sibling namespaces present', await pg.evaluate('!!(DABSy.actions&&DABSy.capabilities&&DABSy.intentSafety)'))
    # honest capability states in a plain browser (no Android shell)
    st=await pg.evaluate('DABSy.capabilities.statusAll().then(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v.state])))')
    chk('in the browser every Android capability is unsupported; task.add is available', all(st[k]=='unsupported' for k in ['app.launch','timer.set','calendar.insert','reminder.schedule','share.text','bluetooth.settings']) and st['task.add']=='available', st)
    # real end-to-end on the REAL task engine
    before=await pg.evaluate('DABSy.tasks.list().length')
    r=await pg.evaluate('''async()=>{const p=DABSy.execution.createPlan("Add a task to revise chapter 4");const out=await DABSy.execution.run(p);
      const t=DABSy.tasks.get(p.steps[0].result.taskId);return {status:out.status,step:p.steps[0].status,title:t&&t.title,headline:out.report.headline,ev:p.steps[0].verification.evidence}}''')
    chk('real task-engine: plan runs, READ BACK, status verified', r['status']=='completed' and r['step']=='verified' and r['title']=='Revise chapter 4', r)
    chk('task really exists in the task list', await pg.evaluate('DABSy.tasks.list().length')==before+1)
    u=await pg.evaluate('''async()=>{const p=DABSy.execution.list().slice(-1)[0];const o=await DABSy.execution.undo(p);return {ok:o.ok,n:DABSy.tasks.list().length}}''')
    chk('undo removes it again', u['ok'] and u['n']==before, u)
    # a question never becomes an action in the real app
    q=await pg.evaluate('''async()=>{const t0=DABSy.tasks.list().length;const p=DABSy.execution.createPlan("Should I add a task to revise chapter 4?");const o=await DABSy.execution.run(p);return {s:p.status,ok:o.ok,same:DABSy.tasks.list().length===t0}}''')
    chk('question → not_actionable, task list untouched', q['s']=='not_actionable' and not q['ok'] and q['same'], q)
    # existing permissions-engine is reused (no second permission system)
    ps=await pg.evaluate('DABSy.capabilities.permissionState("notifications").then(s=>[s, DABSy.permissions.REGISTRY.notifications.supported()])')
    chk('notification permission state comes from the existing permissions-engine', ps[0] in ('prompt','granted','denied'), ps)
    # existing features untouched
    chk('existing engines still present', await pg.evaluate('Promise.all([DABSy.require("planner"),DABSy.require("floating")]).then(()=>!!(DABSy.ai&&DABSy.butler&&DABSy.planner&&DABSy.tasks&&DABSy.permissions&&DABSy.floating&&DABSy.memory))'))
    chk('floating contract intact (window.DABSyFloating.receive + CONTRACT)', await pg.evaluate('typeof window.DABSyFloating.receive==="function" && DABSy.floating.CONTRACT.toNative.length>0'))
    chk('ai.parseDayOffset exported and agrees with the original behaviour', await pg.evaluate('DABSy.ai.parseDayOffset("tomorrow")===1 && DABSy.ai.parseDayOffset("nothing")===0'))
    h=await pg.evaluate('(async()=>{const r=await DABSy.butler.handle("how busy am I today");return !!r})()')
    chk('butler still answers its own commands', h)
    chk('execution history stored under its own key, chat history untouched', await pg.evaluate('Array.isArray(DABSy.memory.read("exec_history_v1",null)) && DABSy.memory.getHistory().every(h=>!h.capability)'))
    chk('service worker lists the new modules', 'execution-engine.js' in (await (await ctx.request.get('http://localhost:8090/sw.js')).text()))
    chk('no page errors', not errs, errs)
    await b.close()
  bad=[n for n,o in res if not o]; print('\n%d/%d passed'%(len(res)-len(bad),len(res)))
  raise SystemExit(1 if bad else 0)
asyncio.run(main())
