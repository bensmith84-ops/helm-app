#!/usr/bin/env python3
"""In-house fulfillment drawings - photoreal-style isometrics + site plans.

Bulk-pick design (no forward pick). Every zone labeled with name + sq ft.
Run:  python3 tools/gen_inhouse_views.py
"""
import math, os, hashlib

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "rfp", "dl-inhouse")
S = 1.9
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))

def iso(x, y, z=0.0):
    return ((x - y) * C30 * S, (x + y) * S30 * S - z * S)

def pts(seq): return " ".join(f"{a:.1f},{b:.1f}" for a, b in seq)

def esc(t): return t.replace("&", "&amp;")

def rnd(*key):
    h = hashlib.md5(("|".join(map(str, key))).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF

def shade(c, f):
    c = c.lstrip("#"); r, g, b = (int(c[i:i+2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % (min(255,int(r*f)), min(255,int(g*f)), min(255,int(b*f)))

INK, INK2 = "#17306E", "#5A6B85"
CONC = "#E8EAEC"

class Scene:
    def __init__(self):
        self.items = []   # (depth, svg)
    def add(self, depth, svg):
        self.items.append((depth, svg))
    def emit(self):
        return "".join(s for _, s in sorted(self.items, key=lambda t: t[0]))

def gshadow(x, y, w, d, spread=2.2, op=0.14):
    q = [iso(x - spread*.4, y - spread*.4), iso(x + w + spread, y - spread*.4),
         iso(x + w + spread, y + d + spread), iso(x - spread*.4, y + d + spread)]
    return f'<polygon points="{pts(q)}" fill="#3B475C" opacity="{op}"/>'

def box(sc, x, y, w, d, h, fill, edge=None, z0=0.0, op=1.0, top=None, shadow=True, dp=0.0):
    edge = edge or shade(fill, .62)
    top = top or shade(fill, 1.06)
    p000, p100 = iso(x, y, z0), iso(x + w, y, z0)
    p110 = iso(x + w, y + d, z0)
    t000, t100 = iso(x, y, z0 + h), iso(x + w, y, z0 + h)
    t010, t110 = iso(x, y + d, z0 + h), iso(x + w, y + d, z0 + h)
    o = f'<g opacity="{op}">'
    if shadow and z0 < 0.5:
        o += gshadow(x, y, w, d, spread=min(3.5, h*.16+1.2))
    o += f'<polygon points="{pts([p000,p100,t100,t000])}" fill="{shade(fill,.86)}" stroke="{edge}" stroke-width=".6"/>'
    o += f'<polygon points="{pts([p100,p110,t110,t100])}" fill="{shade(fill,.70)}" stroke="{edge}" stroke-width=".6"/>'
    o += f'<polygon points="{pts([t000,t100,t110,t010])}" fill="{top}" stroke="{edge}" stroke-width=".6"/>'
    o += "</g>"
    sc.add(x + y + dp, o)

def carton_stack(sc, x, y, w, d, base_z, key):
    layers = 2 + int(rnd(key, 1) * 2)
    z = base_z
    for L in range(layers):
        hh = 0.9 + rnd(key, L) * 0.5
        shrink = L * 0.22
        cw, cd = w - shrink, d - shrink
        cx, cy = x + shrink/2, y + shrink/2
        tone = 1.0 - 0.05 * L + 0.08 * rnd(key, L, 2)
        box(sc, cx, cy, cw, cd, hh, shade("#C8A36B", tone), z0=z, shadow=False, dp=0.4 + L*0.01)
        # tape line on top
        a, b = iso(cx, cy + cd/2, z + hh), iso(cx + cw, cy + cd/2, z + hh)
        sc.add(x + y + 0.41 + L*0.01,
               f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#A9834F" stroke-width=".7" opacity=".8"/>')
        z += hh

def pallet(sc, x, y, base_z, key, loaded=True, w=3.6, d=3.6):
    box(sc, x, y, w, d, 0.45, "#9A7E52", z0=base_z, shadow=(base_z < .5), dp=0.35)
    if loaded:
        carton_stack(sc, x + .15, y + .15, w - .3, d - .3, base_z + 0.45, key)

def person(sc, x, y, vest="#F5B324", dp=0.6):
    px, py = iso(x, y)
    hpx = 6.0 * S
    o = f'<g>'
    o += f'<ellipse cx="{px:.1f}" cy="{py+1.5:.1f}" rx="4.6" ry="1.9" fill="#3B475C" opacity=".22"/>'
    o += f'<rect x="{px-1.9:.1f}" y="{py-hpx*0.42:.1f}" width="3.8" height="{hpx*0.42:.1f}" fill="#3E4A5C" rx="1"/>'
    o += f'<rect x="{px-2.4:.1f}" y="{py-hpx*0.78:.1f}" width="4.8" height="{hpx*0.40:.1f}" fill="{vest}" rx="1.4"/>'
    o += f'<rect x="{px-2.4:.1f}" y="{py-hpx*0.62:.1f}" width="4.8" height="1.1" fill="#DDE4EC" opacity=".9"/>'
    o += f'<circle cx="{px:.1f}" cy="{py-hpx*0.87:.1f}" r="2.1" fill="#EFC49C"/>'
    o += f'<path d="M {px-2.2:.1f} {py-hpx*0.90:.1f} a 2.3 2.3 0 0 1 4.4 0 z" fill="#F8D24A"/>'
    o += "</g>"
    sc.add(x + y + dp, o)

def forklift(sc, x, y, dp=0.5):
    box(sc, x, y, 6.5, 3.6, 3.4, "#E8842B", dp=dp)                      # body
    box(sc, x + 1.2, y + .5, 3.4, 2.6, 2.2, "#2E3742", z0=3.4, shadow=False, dp=dp+.01)  # cab
    box(sc, x - 0.7, y + 0.5, 0.7, 2.6, 11.5, "#4A5462", shadow=False, dp=dp+.02)        # mast
    box(sc, x - 3.6, y + 0.7, 3.0, 1.0, 0.28, "#8B939E", z0=1.1, shadow=False, dp=dp+.03) # fork
    box(sc, x - 3.6, y + 2.1, 3.0, 1.0, 0.28, "#8B939E", z0=1.1, shadow=False, dp=dp+.03)
    person(sc, x + 3.0, y + 1.8, vest="#F5B324", dp=dp + .04)

def tote(sc, x, y, z, dp):
    box(sc, x, y, 1.9, 1.4, 1.0, "#5B7FD4", z0=z, shadow=False, dp=dp)

def rack_run(sc, x, y, length, depth, levels=4, lvl_h=6.2, key="r"):
    n_bays = int(length // 9)
    for b in range(n_bays + 1):                                          # steel uprights
        ux = x + b * 9
        box(sc, ux, y, .55, .55, levels*lvl_h, "#E8842B", shadow=False, dp=0.30)
        box(sc, ux, y + depth - .55, .55, .55, levels*lvl_h, "#E8842B", shadow=False, dp=0.30)
    for lv in range(levels):
        z = lv * lvl_h
        if lv:
            for edge_y in (y, y + depth - .4):                           # beams
                a, b2 = iso(x, edge_y, z), iso(x + length, edge_y, z)
                sc.add(x + y + 0.32, f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b2[0]:.1f}" y2="{b2[1]:.1f}" stroke="#D96F1E" stroke-width="1.3"/>')
        for b in range(n_bays):
            for slot in range(2):
                if rnd(key, lv, b, slot) < (0.94 if lv else 0.85):
                    pallet(sc, x + b*9 + 0.9 + slot*4.1, y + (depth-3.6)/2, z + (0.15 if lv else 0),
                           (key, lv, b, slot))
    # a picker + pallet jack at floor level
    person(sc, x + length*0.32, y - 2.5, dp=0.62)
    tote(sc, x + length*0.32 - 2.6, y - 2.4, 0, x + y + 0.61)

def sorter(sc, x, y, length, width):
    box(sc, x, y, length, width, 3.4, "#B9C2CC", dp=0.45)                                  # frame
    box(sc, x + .8, y + .8, length - 1.6, width - 1.6, 1.3, "#4A6FC4", z0=3.4, shadow=False, dp=0.46)  # belt
    for k in range(int(length // 7)):                                                       # bin walls
        box(sc, x + k*7 + .8, y - 4.2, 5.2, 4.0, 6.8, "#D8DEE6", shadow=False, dp=0.44)
        box(sc, x + k*7 + .8, y + width + .2, 5.2, 4.0, 6.8, "#D8DEE6", shadow=False, dp=0.47)
        for r in range(3):                                                                  # bin grid lines
            for yy, dpd in ((y - 4.2, 0.441), (y + width + .2, 0.471)):
                a = iso(x + k*7 + .8, yy, 2.1 + r*2.3); b = iso(x + k*7 + 6.0, yy, 2.1 + r*2.3)
                sc.add(x + y + dpd, f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#AEB9C6" stroke-width=".6"/>')
    for k in range(int(length // 11)):                                                      # totes on belt
        tote(sc, x + 2.5 + k*11 + rnd("t",k)*3, y + width/2 - .7, 4.7, x + y + 0.48)
    box(sc, x - 7.5, y + width/2 - 3.2, 7.5, 6.4, 3.2, "#8FA0B4", dp=0.43)                  # induct
    person(sc, x - 9.5, y + width/2 + 1.2, dp=0.49)
    # safety line
    q = [iso(x-9, y-6), iso(x+length+2, y-6), iso(x+length+2, y+width+6), iso(x-9, y+width+6)]
    sc.add(x + y + 0.20, f'<polygon points="{pts(q)}" fill="none" stroke="#F2C230" stroke-width="1.6" stroke-dasharray="7 5" opacity=".85"/>')

def pack_row(sc, x, y, n, pitch=15):
    for i in range(n):
        bx = x + i*pitch
        box(sc, bx, y, 10, 4.5, 3.0, "#8FA6C4", dp=0.5)                     # bench
        box(sc, bx + .6, y + .6, 3.4, 3.2, 1.3, "#C8A36B", z0=3.0, shadow=False, dp=0.51)  # carton
        box(sc, bx + 6.4, y + .8, 2.6, 2.6, 2.1, "#EDEFF2", z0=3.0, shadow=False, dp=0.51) # mailer stack
        if rnd("pp", i) < 0.8:
            person(sc, bx + 5, y + 6.5, vest="#3BA2E8" if rnd("pv",i) < .4 else "#F5B324", dp=0.52)

def trailer(sc, x, y, dp):
    box(sc, x, y, 42, 9.5, 10.2, "#E2E6EB", z0=3.4, shadow=False, dp=dp)          # body
    for wx in (x + 5, x + 34):                                                     # wheels
        box(sc, wx, y + 1.2, 4.5, 7.1, 3.0, "#48505B", z0=0.4, shadow=False, dp=dp + .01)
    p1 = iso(x, y, 3.4); p2 = iso(x, y + 9.5, 3.4)                                 # underside line
    sc.add(dp + .02, f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#AAB2BB" stroke-width=".8"/>')

def dock_wall(sc, side, W, D, positions, wall_h, with_trailers=True):
    xw = 0 if side == "W" else W
    dh = 11.0                                                                       # door height
    if side == "W":
        # cut-away side: low stub wall (12 ft) anchors the doors; trailers behind it
        stub_h = 13
        segs = [0] + sorted(positions) + [D]
        prev = 0
        wall = ""
        for p in sorted(positions):
            if p > prev:
                a, b = iso(0, prev), iso(0, p)
                t1, t2 = iso(0, prev, stub_h), iso(0, p, stub_h)
                wall += f'<polygon points="{pts([a,b,t2,t1])}" fill="#D6DDE6" stroke="#9AA7B5" stroke-width="1" opacity=".97"/>'
            prev = p + 9.5
        if prev < D:
            a, b = iso(0, prev), iso(0, D)
            t1, t2 = iso(0, prev, stub_h), iso(0, D, stub_h)
            wall += f'<polygon points="{pts([a,b,t2,t1])}" fill="#D6DDE6" stroke="#9AA7B5" stroke-width="1" opacity=".97"/>'
        cap1, cap2 = iso(0, 0, stub_h), iso(0, D, stub_h)
        wall += f'<line x1="{cap1[0]:.1f}" y1="{cap1[1]:.1f}" x2="{cap2[0]:.1f}" y2="{cap2[1]:.1f}" stroke="#AEB8C4" stroke-width="1.2"/>'
        sc.add(-9200, wall)
    for p in positions:
        a, b = iso(xw, p, 0.2), iso(xw, p + 9.5, 0.2)
        c, d2 = iso(xw, p + 9.5, dh), iso(xw, p, dh)
        panels = f'<polygon points="{pts([a,b,c,d2])}" fill="#98A6B6" stroke="#7C8CA0" stroke-width=".8"/>'
        for k in range(1, 5):
            z = dh * k / 5
            p1, p2 = iso(xw, p, z), iso(xw, p + 9.5, z)
            panels += f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#7C8CA0" stroke-width=".5"/>'
        sc.add(-9150 if side == "W" else (xw + p) + 0.9, panels)
        if with_trailers and side == "E" and rnd("tr", side, p) < 0.8:
            trailer(sc, W + 1.5, p, dp=(W + p) + 420)                               # beyond east wall

def stub_south(sc, W):
    a, b = iso(0, 0), iso(W, 0)
    t1, t2 = iso(0, 0, 2.6), iso(W, 0, 2.6)
    sc.add(8500, f'<polygon points="{pts([a,b,t2,t1])}" fill="#E5EAF0" stroke="#B7C0CB" stroke-width="1" opacity=".8"/>')

def zone_tint(sc, x, y, w, d, fill, edge):
    q = [iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)]
    sc.add(x + y - 900, f'<polygon points="{pts(q)}" fill="{fill}" stroke="{edge}" stroke-width="1.1" opacity=".55"/>')

def zone_label(sc, x, y, w, d, name, sqft, fs=11.5, note=None):
    cx, cy = iso(x + w/2, y + d/2)
    tw = max(len(name), len(note or ""), 10) * fs * 0.60 + 16
    hh = 42 if note else 30
    o = (f'<g><rect x="{cx-tw/2:.0f}" y="{cy-14:.0f}" width="{tw:.0f}" height="{hh}" rx="6" fill="#FFFFFF" opacity=".85" stroke="#C9D3DF" stroke-width=".6"/>'
         f'<text x="{cx:.0f}" y="{cy-1:.0f}" font-size="{fs}" font-weight="700" fill="{INK}" text-anchor="middle">{esc(name)}</text>'
         f'<text x="{cx:.0f}" y="{cy+11:.0f}" font-size="{fs-2}" fill="{INK2}" text-anchor="middle">{sqft:,} sq ft</text>')
    if note:
        o += f'<text x="{cx:.0f}" y="{cy+23:.0f}" font-size="{fs-2.5}" fill="{INK2}" text-anchor="middle">{esc(note)}</text>'
    o += "</g>"
    sc.add(9000 + x + y, o)

def build_scene(site):
    if site == "east":
        W, D = 180, 150
        zones = [
            ("off",  0,   0,  25,  40, "Office & welfare", 1000),
            ("recv", 0,  96,  46,  54, "Receiving & returns", 2500),
            ("rack", 50,  86,  98,  64, "Reserve racking + bulk pick", 6284),
            ("sort", 14,  40, 130,  36, "Sure Sort", 4660),
            ("pack", 14,   6, 130,  29, "Pack", 3781),
            ("out",  152,  0,  28, 143, "Outbound & mail staging", 4000),
        ]
        recv_doors, out_doors, rack_runs, pack_n, sort_len = [102,120,138], [14,48,82,116], 3, 8, 110
    else:
        W, D = 140, 100
        zones = [
            ("off",  0,   0,  20,  35, "Office & welfare", 700),
            ("recv", 0,  48,  30,  52, "Receiving & returns", 1550),
            ("rack", 30,  66,  68,  34, "Reserve racking + bulk pick", 2319),
            ("sort", 14,  30,  88,  36, "Sure Sort", 3170),
            ("pack", 14,   2,  50,  27, "Pack", 1387),
            ("out",  112,   8,  28,  80, "Outbound & mail staging", 2250),
        ]
        recv_doors, out_doors, rack_runs, pack_n, sort_len = [56,76], [22,50,78], 2, 4, 72
    sc = Scene()
    # concrete floor with sheen
    sc.add(-10000, f'<defs><linearGradient id="fl{site}" x1="0" y1="0" x2="1" y2="1">'
                   f'<stop offset="0" stop-color="#F0F2F4"/><stop offset=".55" stop-color="{CONC}"/>'
                   f'<stop offset="1" stop-color="#DEE2E6"/></linearGradient></defs>')
    sc.add(-9999, f'<polygon points="{pts([iso(0,0),iso(W,0),iso(W,D),iso(0,D)])}" fill="url(#fl{site})" stroke="#B7C0CB" stroke-width="1.4"/>')
    for gx in range(0, W+1, 25):
        a, b = iso(gx, 0), iso(gx, D)
        sc.add(-9990, f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#D5DAE0" stroke-width=".45"/>')
    for gy in range(0, D+1, 25):
        a, b = iso(0, gy), iso(W, gy)
        sc.add(-9990, f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#D5DAE0" stroke-width=".45"/>')
    tints = {"recv":("#D6E7F8","#9CBCDD"),"rack":("#E2DEF6","#ABA2DC"),"sort":("#FBE4C8","#E0A868"),
             "pack":("#D9F0DC","#8FC79C"),"out":("#F8DEDE","#D89A9A"),"ret":("#F3EDD4","#C7BA79"),"off":("#E4E9F0","#A9B6C8")}
    zx = {}
    for key, x, y, w, d, name, sq in zones:
        zone_tint(sc, x, y, w, d, *tints[key]); zx[key] = (x, y, w, d)
        zone_label(sc, x, y, w, d, name, sq,
                   note=(f"{sq*2:,} sq ft over 2 levels" if key == "off" else None))
    # green walkway lane along the front
    q = [iso(4, D*0.24), iso(W-4, D*0.24), iso(W-4, D*0.24+5), iso(4, D*0.24+5)]
    sc.add(-9980, f'<polygon points="{pts(q)}" fill="#7FBF8E" opacity=".35"/>')
    # geometry
    x, y, w, d = zx["rack"]
    run_d = 9.5; gap = (d - rack_runs*run_d) / max(rack_runs - 1, 1)
    for r in range(rack_runs):
        rack_run(sc, x + 2, y + r*(run_d+gap), w - 4, run_d, key=f"{site}{r}")
    forklift(sc, x + w*0.55, y - 7)
    x, y, w, d = zx["sort"]; sorter(sc, x + (w-sort_len)/2 + 6, y + (d-12)/2, sort_len, 12)
    x, y, w, d = zx["pack"]; pack_row(sc, x + 6, y + d - 12, pack_n)
    x, y, w, d = zx["recv"]
    for i in range(4 if site == "east" else 3):
        pallet(sc, x + 6 + (i%2)*6.5, y + 8 + (i//2)*7, 0, ("rc",site,i), w=4.5, d=4.5)
    for i in range(2):                                                   # returns corner
        pallet(sc, x + w - 12, y + 8 + i*8, 0, ("rt",site,i), w=4.2, d=4.2)
        tote(sc, x + w - 6, y + 10 + i*8, 0, x + y + 0.56)
    person(sc, x + 10, y + 22, vest="#3BA2E8")
    x, y, w, d = zx["out"]
    for i in range(10 if site == "east" else 6):
        loaded = rnd("ol",site,i) < .85
        pallet(sc, x + 6 + (i%2)*10, y + 8 + (i//2)*13, 0, ("ot",site,i), w=5, d=5, loaded=loaded)
    # mail trays: white stacks
    for i in range(3):
        box(sc, x + 6 + i*8, y + d - 22, 5, 5, 3.8, "#F2F4F6", dp=0.55)
    person(sc, x + w*0.45, y + d*0.55)
    x, y, w, d = zx["off"]
    box(sc, x + 1.5, y + 1.5, w - 3, d - 3, 22, "#CBD5E2", dp=0.40)
    for lvl_z in (5.5, 15.5):                                            # window bands (2 levels)
        p1, p2 = iso(x + 1.5, y + 1.5, lvl_z), iso(x + w - 1.5, y + 1.5, lvl_z)
        sc.add(x + y + 0.42, f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#8FB6DE" stroke-width="3.4" opacity=".85"/>')
        p1, p2 = iso(x + w - 1.5, y + 1.5, lvl_z), iso(x + w - 1.5, y + d - 1.5, lvl_z)
        sc.add(x + y + 0.42, f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#7FA9D2" stroke-width="3.4" opacity=".85"/>')
    p1, p2 = iso(x + 1.5, y + 1.5, 11), iso(x + w - 1.5, y + 1.5, 11)   # mid-floor line
    sc.add(x + y + 0.43, f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#9AA9BE" stroke-width="1.4"/>')
    # docks + trailers, then translucent shell walls
    wall_h = 32
    dock_wall(sc, "W", W, D, recv_doors, wall_h)
    dock_wall(sc, "E", W, D, out_doors, wall_h)
    for a, b in [((0, D), (W, D)), ((W, 0), (W, D))]:
        p1, p2 = iso(*a), iso(*b); t1, t2 = iso(*a, wall_h), iso(*b, wall_h)
        sc.add(8000, f'<polygon points="{pts([p1,p2,t2,t1])}" fill="#ECF1F6" stroke="#B7C0CB" stroke-width="1" opacity=".38"/>')
    stub_south(sc, W)
    xs, ys = [], []
    for px in (-46, W + 46):
        for py in (0, D):
            for zz in (0, 40):
                q = iso(px, py, zz); xs.append(q[0]); ys.append(q[1])
    return sc.emit(), (min(xs), min(ys), max(xs), max(ys))

def wrap_sub(sub, width):
    words, lines, cur = sub.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur); return lines[:3]

def emit(fname, title, sub, body, vb, extra_h=86):
    x0, y0, x1, y1 = vb; pad = 26
    vw = x1 - x0 + 2*pad
    fs_t = min(16.5, vw / (0.64 * max(len(title), 1)))
    fs_s = max(9.5, min(11.5, fs_t * 0.72))
    subs = wrap_sub(sub, max(60, int(vw / (fs_s * 0.55))))
    vbs = f"{x0-pad:.0f} {y0-pad-extra_h:.0f} {vw:.0f} {y1-y0+2*pad+extra_h:.0f}"
    header = (f'<rect x="{x0-pad:.0f}" y="{y0-pad-extra_h:.0f}" width="{vw:.0f}" height="{extra_h-6:.0f}" fill="#FBFCFE" opacity=".95"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbs}" width="100%" '
           f'style="max-width:1150px;background:#FBFCFE;border:1px solid #DCE6F0;border-radius:12px;'
           f'font-family:Inter,system-ui,sans-serif">{body}{header}'
           f'<text x="{x0-pad+22:.0f}" y="{y0-pad-extra_h+28:.0f}" font-size="{fs_t:.1f}" font-weight="700" fill="{INK}">{esc(title)}</text>'
           + "".join(f'<text x="{x0-pad+22:.0f}" y="{y0-pad-extra_h+46+i*(fs_s+4):.0f}" font-size="{fs_s:.1f}" fill="{INK2}">{esc(l)}</text>'
                     for i, l in enumerate(subs)) + "</svg>")
    with open(os.path.join(OUT, fname), "w") as f: f.write(svg)
    print("wrote", fname, len(svg))

def crop(vb, fx0, fy0, fx1, fy1):
    x0, y0, x1, y1 = vb
    return (x0+(x1-x0)*fx0, y0+(y1-y0)*fy0, x0+(x1-x0)*fx1, y0+(y1-y0)*fy1)

def site_plan(site):
    if site == "east":
        W, D, cW, cE, park, title = 180, 150, 130, 160, 40, "East node - Hebron, KY  |  site plan  |  building 27,000 sq ft (180 x 150 ft)"
    else:
        W, D, cW, cE, park, title = 140, 100, 120, 130, 20, "West node - Las Vegas, NV  |  site plan  |  building 14,000 sq ft (140 x 100 ft)"
    s = 1.9
    tw, td = cW + W + cE, D + 115
    acres = (tw * td) / 43560
    def R(x, y, w, h, fill, edge, rx=3, sw=1.2, op=1.0):
        return (f'<rect x="{x*s:.0f}" y="{y*s:.0f}" width="{w*s:.0f}" height="{h*s:.0f}" fill="{fill}" '
                f'stroke="{edge}" stroke-width="{sw}" rx="{rx}" opacity="{op}"/>')
    def T(x, y, t, fs=12, wgt="700", fill=INK, anch="middle"):
        return f'<text x="{x*s:.0f}" y="{y*s:.0f}" font-size="{fs}" font-weight="{wgt}" fill="{fill}" text-anchor="{anch}">{esc(t)}</text>'
    b = f'<defs><linearGradient id="roof{site}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDF0F4"/><stop offset="1" stop-color="#D8DEE5"/></linearGradient></defs>'
    b += R(0, 0, tw, td, "#DCE5D8", "#B9C6B2", 6)                                  # landscaping
    for i in range(14):                                                             # trees
        tx, ty = 8 + rnd("tx", site, i) * (tw-16), 4 + rnd("ty", site, i) * 8
        b += f'<circle cx="{tx*s:.0f}" cy="{(td-6 if rnd("tz",site,i)<.5 else ty)*s:.0f}" r="{5+rnd("tr2",site,i)*3:.0f}" fill="#8FB98A" stroke="#6E9A69" stroke-width="1"/>'
    b += R(4, 46, tw - 8, td - 56, "#C6CCD3", "#AAB2BB", 4)                        # asphalt
    b += R(cW, 55, W, D, "url(#roof" + site + ")", "#95A2B1", 4, 1.6)              # roof
    for i in range(int(W//42)):                                                     # skylights + RTUs
        b += R(cW + 16 + i*42, 65, 16, 9, "#E9F2FA", "#AFC4D8", 2, .8)
        b += R(cW + 22 + i*42, D + 30, 10, 9, "#B9C2CC", "#95A2B1", 2, .8)
    b += T(cW + W/2, 55 + D/2 - 6, "Building")
    b += T(cW + W/2, 55 + D/2 + 9, f"{W*D:,} sq ft ({W} x {D} ft)", 11, "400", INK2)
    b += T(cW/2, 66, "Inbound truck court"); b += T(cW/2, 80, f"{cW} ft deep", 10.5, "400", INK2)
    b += T(cW + W + cE/2, 66, "Outbound truck court"); b += T(cW + W + cE/2, 80, f"{cE} ft deep + trailer storage", 10.5, "400", INK2)
    n_in, n_out = (3, 4) if site == "east" else (2, 3)
    for i in range(n_in):                                                           # docked inbound trucks
        yy = 95 + i*22
        b += R(cW - 46, yy, 44, 10, "#E4E8EC", "#9AA6B2", 2)
        b += R(cW - 54, yy + 1, 8, 8, "#42566E", "#2E3E52", 2)
    for i in range(n_out):
        yy = 92 + i*15
        b += R(cW + W + 2, yy, 44, 10, "#E4E8EC", "#9AA6B2", 2)
        b += R(cW + W + 46, yy + 1, 8, 8, "#42566E", "#2E3E52", 2)
    for i in range(5):                                                              # trailer storage
        b += R(cW + W + cE - 52, 90 + i*17, 44, 10, "#D3D9DF", "#A5AFBA", 2)
    b += T(cW + W + cE - 30, 90 + 5*17 + 12, "trailer storage", 9.5, "400", INK2)
    b += R(cW - 34, 8, W + 68, 32, "#BBC3CC", "#9AA6B2", 3)                        # parking
    b += T(cW + W/2, 43, f"Staff parking - {park} spaces", 11)
    cols = ["#8FA8C4", "#C4A38F", "#9DBB9A", "#B6A6C9", "#C9C0A0", "#A8B7C6"]
    n_show = min(park, 30)
    for i in range(n_show):
        cx = cW - 28 + i * ((W + 56) / n_show)
        b += f'<line x1="{(cx-1.5)*s:.0f}" y1="{10*s:.0f}" x2="{(cx-1.5)*s:.0f}" y2="{36*s:.0f}" stroke="#E6EAEE" stroke-width="1"/>'
        if rnd("car", site, i) < 0.7:
            b += R(cx, 12, 5.2, 11, cols[int(rnd("cc",site,i)*6)], "#7C8896", 2, .8)
    vb = (-16, -46, tw*s + 32, td*s + 66)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="100%" '
           f'style="max-width:1150px;background:#FBFCFE;border:1px solid #DCE6F0;border-radius:12px;font-family:Inter,system-ui,sans-serif">'
           f'<text x="-2" y="-24" font-size="16" font-weight="700" fill="{INK}">{esc(title)}</text>'
           f'<text x="-2" y="-6" font-size="11.5" fill="{INK2}">Roughly {acres:.1f} acres. Cross-dock: inbound west, outbound east with trailer storage, staff parking and landscaping across the front. Courts sized for 53 ft trailers.</text>'
           f'{b}</svg>')
    with open(os.path.join(OUT, f"view_site_{site}.svg"), "w") as f: f.write(svg)
    print(f"wrote view_site_{site}.svg", len(svg))

def main():
    os.makedirs(OUT, exist_ok=True)
    body, vb = build_scene("east")
    emit("view_east_1.svg", "East node - Hebron, KY  |  27,000 sq ft  |  bulk-pick design",
         "View 1 of 4 - overview from the south-west. 180 x 150 ft, 32 ft clear. No forward pick: floor-level pallet faces in reserve racking feed Sure Sort. Grid 25 ft. Each zone labeled with its sq ft.", body, vb)
    emit("view_east_2.svg", "East - receiving and reserve racking (bulk pick faces)",
         "View 2 of 4 - three inbound doors, combined receiving and returns floor, 1,150 pallet positions across three runs, four levels to 24 ft. The floor level is the bulk pick face; upper levels replenish it by letdown.", body, crop(vb, 0.0, 0.0, 0.60, 0.74))
    emit("view_east_3.svg", "East - Sure Sort and pack line",
         "View 3 of 4 - bulk-picked totes induct at the near end; the 130 ft bed drops units to order bins; eight pack stations work the front face.", body, crop(vb, 0.16, 0.30, 0.80, 1.00))
    emit("view_east_4.svg", "East - outbound, mail staging and office",
         "View 4 of 4 - four shipping doors with trailers on the dock, mail trays staged on pallets for presort collection, compact two-level office block in the corner.", body, crop(vb, 0.46, 0.06, 1.00, 0.86))
    body, vb = build_scene("west")
    emit("view_west_1.svg", "West node - Las Vegas, NV  |  14,000 sq ft  |  bulk-pick design",
         "View 1 of 2 - same flow at smaller scale: two inbound doors, combined receiving and returns, two racking runs with floor-level bulk pick faces, an 85 ft Sure Sort, four pack stations. Each zone labeled with its sq ft.", body, vb)
    emit("view_west_2.svg", "West - Sure Sort, pack and outbound",
         "View 2 of 2 - the working half: sorter, pack line and staging to three shipping doors.", body, crop(vb, 0.25, 0.20, 1.00, 1.00))
    site_plan("east"); site_plan("west")

if __name__ == "__main__":
    main()
