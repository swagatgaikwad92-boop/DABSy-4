from harness import *
import json
VID=[{"url":"/watch?v=aaaaaaaaaaa","title":"Newton's laws of motion animation explained for beginners","uploaderName":"Khan Academy","duration":420,"shortDescription":"animated visual intro to Newton's laws of motion"},
     {"url":"/watch?v=bbbbbbbbbbb","title":"Newton's laws of motion advanced JEE problems","uploaderName":"Physics Wallah","duration":1380,"shortDescription":"JEE advanced problems on Newton's laws of motion"},
     {"url":"/watch?v=ccccccccccc","title":"Newton's laws of motion lecture","uploaderName":"MIT OpenCourseWare","duration":900,"shortDescription":"lecture on Newton's laws of motion"}]
WIKI={"query":{"search":[{"title":"Newton's laws of motion","snippet":"Newton's laws of motion are three physical laws"}]}}
srv=serve()
try:
  with sync_playwright() as p:
    b,pg,errs=newpage(p,touch=True)
    def piped(route): route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps({"items":VID}))
    def wiki(route): route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps(WIKI))
    def arch(route): route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps({"response":{"docs":[]}}))
    pg.route("**/pipedapi.kavin.rocks/**",piped); pg.route("**/pipedapi.adminforge.de/**",piped); pg.route("**/api.piped.private.coffee/**",piped)
    pg.route("**/en.wikipedia.org/**",wiki); pg.route("**/archive.org/**",arch)
    pg.route("**/dabsy-brain.swagatdemo9292.workers.dev**",lambda r:r.fulfill(status=500,body="{}"))
    pg.evaluate("window.DABSy.require('agent')"); pg.wait_for_timeout(1500)
    pg.evaluate("window.DABSy.require('research')"); pg.wait_for_timeout(500)
    goal={"subject":"physics","topic":"newton's laws of motion","minutes":40,"raw":"understand newton's laws of motion"}
    out=pg.evaluate("""async(g)=>{const D=window.DABSy;await D.require('research');
      const a=await D.research.find(g);
      const b=await D.research.find(g,{prefs:"I want visual explanations, animated videos and beginner-friendly explanations. Avoid lengthy PDFs."});
      const c=await D.research.find(g,{prefs:"no videos, only reading"});
      const d=await D.research.find(g,{prefs:"only pdf notes, avoid videos and avoid articles"});
      const f=r=>r.resources.map(x=>[x.type,x.title.slice(0,40),+x.relevance.toFixed(2)]);
      return {base:f(a),pref:f(b),prefNote:b.prefs,prefWhy:b.resources[0]&&b.resources[0].why,noVid:f(c),none:{n:d.resources.length,mode:d.mode,note:d.note},parsed:D.research.parsePrefs("I want visual explanations, animated videos and beginner-friendly explanations. Avoid lengthy PDFs.")}}""",goal)
    print(json.dumps(out,indent=1)[:1800])
    check("baseline returns real candidates",len(out["base"])>=2)
    check("preference run puts animated beginner video first",out["pref"][0][1].startswith("Newton's laws of motion animation"),out["pref"][:2])
    check("heavy JEE video demoted/removed for beginner+visual",not out["pref"] or out["pref"][0][1]!="Newton's laws of motion advanced JEE problems")
    check("parsePrefs reads wants and avoids",out["parsed"]["flags"]==["visual","beginner","short"] or set(out["parsed"]["flags"])>={"visual","beginner"} , out["parsed"])
    check("avoid.pdf and avoid.long detected",out["parsed"]["avoid"].get("pdf") and out["parsed"]["avoid"].get("long"))
    check("results say why they match",out["prefWhy"] and "Matches your preference" in out["prefWhy"],out["prefWhy"])
    check("'no videos' removes every video",all(x[0]!="video" for x in out["noVid"]) and len(out["noVid"])>=1,out["noVid"])
    check("impossible preference -> honest empty result, nothing invented",out["none"]["n"]==0 and out["none"]["mode"]=="none" and "nothing" in out["none"]["note"].lower(),out["none"])
    # UI: the card
    pg.evaluate("""window.__found=null""")
    pg.evaluate("""(async()=>{const D=window.DABSy;await D.require('agent');await D.require('cards');
      const g={subject:'physics',topic:"newton's laws of motion",minutes:40,raw:"understand newton's laws of motion"};
      const found=await D.research.find(g);
      window.__p=D.cards.recommend(found,{minutes:40,title:'Recommended',intro:'Here is what I found.',note:found.note,refine:p=>D.research.find(g,{prefs:p})});})()""")
    pg.wait_for_selector(".rc-pref textarea",timeout=8000)
    last=pg.evaluate("(()=>{const b=document.querySelector('.rc-list');return b.lastElementChild.className})()")
    check("preference box is the very last element of the card",last=="rc-pref",last)
    rows0=pg.locator(".rc-row").count()
    pg.fill(".rc-pref textarea","I want visual explanations, animated videos and beginner-friendly explanations. Avoid lengthy PDFs.")
    pg.click(".rc-pref .btn.primary",timeout=4000)
    pg.wait_for_selector(".rc-loading",timeout=3000)
    check("loading state shown while searching",True)
    pg.wait_for_selector(".rc-row",timeout=8000)
    check("recommendations refreshed",pg.locator(".rc-pref-on").count()==1 and "visual" in pg.inner_text(".rc-pref-on"),pg.inner_text(".rc-pref-on") if pg.locator(".rc-pref-on").count() else "")
    first=pg.inner_text(".rc-row h3")
    check("first recommendation now the animated beginner video",first.startswith("Newton's laws of motion animation"),first)
    pg.fill(".rc-pref textarea","only pdf notes, avoid videos and avoid articles"); pg.click(".rc-pref .btn.primary")
    pg.wait_for_selector(".rc-empty",timeout=8000)
    check("empty state is honest and offers earlier results",pg.locator(".rc-empty button").count()==1 and "matched" in pg.inner_text(".rc-empty").lower())
    pg.click(".rc-empty button"); pg.wait_for_selector(".rc-row",timeout=3000)
    check("can go back to earlier results",pg.locator(".rc-row").count()>=1)
    check("no page errors",not errs,errs[:3])
    b.close()
finally: srv.terminate()
import sys; sys.exit(0 if summary() else 1)
