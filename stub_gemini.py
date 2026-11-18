# STAND-IN for Gemini, used ONLY by tests. It is NOT a vision model: it decodes the received picture with PIL and reports PIXEL FACTS
# (size, ink coverage, ink bounding box, dominant colour; for the probe picture: circle colour + digit by template matching).
# It exists to prove the picture arrives intact through browser -> Worker -> provider-shaped request. It cannot recognise cats or handwriting.
import base64, io, json, sys, os
from http.server import BaseHTTPRequestHandler, HTTPServer
import numpy as np
from PIL import Image, ImageDraw, ImageFont
LOG = "/tmp/e2e_received"; os.makedirs(LOG, exist_ok=True); N = [0]
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]
def digit_mask(d, font):
    im = Image.new("L", (256, 256), 0); dr = ImageDraw.Draw(im); f = ImageFont.truetype(font, 120)
    dr.text((128, 136), d, font=f, fill=255, anchor="mm"); return np.array(im) > 128
def read_probe(img):
    a = np.array(img.convert("RGB").resize((256, 256))).astype(int)
    nonwhite = (a.sum(axis=2) < 700); sat = (a.max(axis=2) - a.min(axis=2)) > 60
    ys, xs = np.where(sat)
    if len(xs) < 2000: return None
    r, g, b = a[sat][:, 0].mean(), a[sat][:, 1].mean(), a[sat][:, 2].mean()
    colour = "red" if r > g and r > b else ("green" if g > r and g > b else "blue")
    inner = (a.min(axis=2) > 200) & ((np.hypot(*np.meshgrid(np.arange(256) - 128, np.arange(256) - 128)) < 85))
    def norm(m):                                   # crop to the glyph's bounding box and resize, so position/size differences don't matter
        ys, xs = np.where(m)
        if len(xs) == 0: return np.zeros((48, 48), bool)
        c = Image.fromarray((m[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype("uint8")).resize((48, 48)); return np.array(c) > 128
    obs = norm(inner); best, score = None, -1
    for f in FONTS:
        if not os.path.exists(f): continue
        for d in "23456789":
            m = norm(digit_mask(d, f)); s = (m & obs).sum() / max(1, (m | obs).sum())
            if s > score: best, score = d, s
    return colour, best
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        parts = body["contents"][0]["parts"]; prompt = parts[0]["text"]; img = None
        for p in parts[1:]:
            if "inline_data" in p:
                raw = base64.b64decode(p["inline_data"]["data"]); N[0] += 1
                ext = "png" if p["inline_data"]["mime_type"].endswith("png") else "jpg"
                open(f"{LOG}/{N[0]:02d}.{ext}", "wb").write(raw); img = Image.open(io.BytesIO(raw)); img.load()
        if img is None: text = "STANDIN: no picture received."
        elif "circle_colour" in prompt:
            r = read_probe(img); text = json.dumps({"circle_colour": r[0], "digit": r[1]}) if r else json.dumps({"error": "NO_IMAGE"})
        else:
            a = np.array(img.convert("L")); bg = np.median(a); ink = np.abs(a.astype(int) - bg) > 40
            ys, xs = np.where(ink); cov = ink.mean() * 100
            box = f"ink spans x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}" if len(xs) else "no ink"
            text = f"STANDIN (pixel facts only, not a vision model): received a valid {img.format} picture {img.width}x{img.height}; ink covers {cov:.1f}% of it; {box}."
        out = json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}}]}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(out)
HTTPServer(("127.0.0.1", 8798), H).serve_forever()
