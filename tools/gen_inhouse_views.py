#!/usr/bin/env python3
"""Generate the in-house fulfillment drawings (public/rfp/dl-inhouse/).

Layout: BULK-PICK design (no forward pick area). Pickers bulk-pick from
floor-level pallet faces in reserve racking and feed Sure Sort induction.

Outputs 8 SVGs: 2 site plans + 4 east views + 2 west views. Detail views are
viewBox crops of one shared isometric scene per site. Every zone is labeled
with its name and sq ft. Run:  python3 tools/gen_inhouse_views.py
"""
import math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "rfp", "dl-inhouse")

# ---------------------------------------------------------------- projection
S = 1.72  # px per ft
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))
def iso(x, y, z=0.0):
    return ((x - y) * C30 * S, (x + y) * S30 * S - z * S)
def pts(seq):
    return " ".join(f"{px:.1f},{py:.1f}" for px, py in seq)

# ---------------------------------------------------------------- palette
INK, INK2, LINE = "#1C3883", "#5A6B85", "#9AA9BE"
FLOOR, GRID = "#F2F5F8", "#DCE3EB"
ZONES = {
    "recv":  ("#DCEBFA", "#8FB6DE"),  # receiving
    "rack":  ("#E3E0F5", "#A79FD8"),  # reserve racking + bulk pick
    "sort":  ("#FDE8D2", "#E5AE6F"),  # sure sort
    "pack":  ("#DFF3E1", "#8CC79A"),  # pack
    "out":   ("#FBE3E3", "#DE9494"),  # outbound & mail
    "ret":   ("#F5F0DC", "#CBBE7A"),  # returns
    "off":   ("#E8EDF3", "#A7B4C6"),  # office
}

def box(x, y, w, d, h, fill, edge, op=1.0):
    """Extruded box: top, left(front-south), right(front-east) faces."""
    p000, p100 = iso(x, y, 0), iso(x + w, y, 0)
    p010, p110 = iso(x, y + d, 0), iso(x + w, y + d, 0)
    t000, t100 = iso(x, y, h), iso(x + w, y, h)
    t010, t110 = iso(x, y + d, h), iso(x + w, y + d, h)
    def shade(c, f):
        c = c.lstrip("#"); r, g, b = (int(c[i:i+2], 16) for i in (0, 2, 4))
        return "#%02x%02x%02x" % (int(r*f), int(g*f), int(b*f))
    o = f'<g opacity="{op}">'
    o += f'<polygon points="{pts([p000,p100,t100,t000])}" fill="{shade(fill,.82)}" stroke="{edge}" stroke-width=".7"/>'
    o += f'<polygon points="{pts([p100,p110,t110,t100])}" fill="{shade(fill,.68)}" stroke="{edge}" stroke-width=".7"/>'
    o += f'<polygon points="{pts([t000,t100,t110,t010])}" fill="{fill}" stroke="{edge}" stroke-width=".7"/>'
    return o + "</g>"

def flat(x, y, w, d, fill, edge, dash=""):
    q = [iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)]
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<polygon points="{pts(q)}" fill="{fill}" stroke="{edge}" stroke-width="1.1"{da} opacity=".92"/>'

def esc(t):
    return t.replace("&", "&amp;")

def zlabel(x, y, w, d, name, sqft, fs=11.5):
    cx, cy = iso(x + w / 2, y + d / 2)
    return (f'<text x="{cx:.0f}" y="{cy:.0f}" font-size="{fs}" font-weight="700" fill="{INK}" '
            f'text-anchor="middle">{esc(name)}</text>'
            f'<text x="{cx:.0f}" y="{cy+13:.0f}" font-size="{fs-1.5}" fill="{INK2}" '
            f'text-anchor="middle">{sqft:,} sq ft</text>')

def pallets(x, y, w, d, nx, ny, h=3.5):
    o, sx, sy = "", w / nx, d / ny
    for i in range(nx):
        for j in range(ny):
            o += box(x + i*sx + .6, y + j*sy + .6, sx - 1.2, sy - 1.2, h, "#D9C9A8", "#B49F76")
    return o

def rack_run(x, y, length, depth, levels=4, lvl_h=6.0):
    o = box(x, y, length, depth, .8, "#C9C4E6", "#A79FD8")
    for lv in range(levels):
        z = 2 + lv * lvl_h
        for k in range(int(length // 10)):
            o += box(x + k*10 + .8, y + .8, 8.4, depth - 1.6, 3.4 if lv else 3.8,
                     "#D9C9A8" if lv else "#CBBBE8", "#A79F86")
        # beam line
        p1, p2 = iso(x, y, z), iso(x + length, y, z)
        o += f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#8F86C6" stroke-width="1"/>'
    return o

def sorter(x, y, length, width):
    o = box(x, y, length, width, 4.5, "#F3C892", "#E5AE6F")            # bed
    o += box(x - 8, y + width/2 - 4, 8, 8, 4.0, "#EDB877", "#D89C55")  # induct
    for k in range(int(length // 8)):                                   # bin walls
        o += box(x + k*8 + 1, y - 4.5, 6, 4, 6.5, "#F7D9B4", "#E5AE6F")
        o += box(x + k*8 + 1, y + width + .5, 6, 4, 6.5, "#F7D9B4", "#E5AE6F")
    return o

def pack_benches(x, y, n, pitch=15, depth=8):
    return "".join(box(x + i*pitch, y, 10, depth, 3.2, "#BFE3C6", "#8CC79A") for i in range(n))

def dock_doors(wall, x0, n, pitch, shell_w, shell_d, wall_h):
    o = ""
    for i in range(n):
        p = x0 + i * pitch
        if wall == "W":
            a, b = iso(0, p, 2), iso(0, p + 10, 2)
            c, d2 = iso(0, p + 10, wall_h*.6), iso(0, p, wall_h*.6)
        else:
            a, b = iso(shell_w, p, 2), iso(shell_w, p + 10, 2)
            c, d2 = iso(shell_w, p + 10, wall_h*.6), iso(shell_w, p, wall_h*.6)
        o += f'<polygon points="{pts([a,b,c,d2])}" fill="#B9C6D6" stroke="#8DA0B6" stroke-width=".8"/>'
    return o

# ---------------------------------------------------------------- scenes
def scene(site):
    """Return (svg_body, extents) for a full isometric site scene."""
    if site == "east":
        W, D = 250, 175
        zones = [
            ("off",  0,   0,  60,  90, "Office & welfare", 5400),
            ("recv", 0,  95,  50,  80, "Inbound receiving", 4000),
            ("rack", 60, 110, 98,  64, "Reserve racking + bulk pick faces", 6284),
            ("sort", 70,  45, 130, 36, "Sure Sort", 4660),
            ("pack", 70,   8, 130, 29, "Pack", 3781),
            ("ret",  160, 90,  40, 85, "Returns", 3400),
            ("out",  200,  0,  50,160, "Outbound & mail staging", 8000),
        ]
    else:
        W, D = 175, 140
        zones = [
            ("off",  0,   0,  52,  75, "Office & welfare", 3900),
            ("recv", 0,  80,  42,  60, "Inbound receiving", 2500),
            ("rack", 42,100,  58,  40, "Reserve racking + bulk pick faces", 2319),
            ("sort", 48, 42,  88,  36, "Sure Sort", 3170),
            ("pack", 48,  8,  50,  28, "Pack", 1387),
            ("ret",  104, 82,  36, 58, "Returns", 2100),
            ("out",  140, 10,  35,130, "Outbound & mail staging", 4500),
        ]
    o = ""
    # floor + 25ft grid
    o += f'<polygon points="{pts([iso(0,0),iso(W,0),iso(W,D),iso(0,D)])}" fill="{FLOOR}" stroke="{LINE}" stroke-width="1.4"/>'
    for gx in range(0, W + 1, 25):
        a, b = iso(gx, 0), iso(gx, D)
        o += f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{GRID}" stroke-width=".5"/>'
    for gy in range(0, D + 1, 25):
        a, b = iso(0, gy), iso(W, gy)
        o += f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{GRID}" stroke-width=".5"/>'
    # zone floor plates
    for key, x, y, w, d, name, sq in zones:
        fill, edge = ZONES[key]
        o += flat(x, y, w, d, fill, edge)
    # geometry
    zx = {z[0]: z for z in zones}
    _, x, y, w, d, *_ = zx["rack"]
    runs = 3 if site == "east" else 2
    run_d = 9
    gap = (d - runs * run_d) / max(runs - 1, 1)
    for r in range(runs):
        o += rack_run(x + 2, y + r * (run_d + gap), w - 4, run_d)
    _, x, y, w, d, *_ = zx["sort"];  o += sorter(x + 10, y + (d-12)/2, w - 20, 12)
    _, x, y, w, d, *_ = zx["pack"];  o += pack_benches(x + 6, y + d - 10, 8 if site == "east" else 4)
    _, x, y, w, d, *_ = zx["recv"];  o += pallets(x + 6, y + 8, min(w-12, 30), min(d-16, 40), 2, 3)
    _, x, y, w, d, *_ = zx["out"];   o += pallets(x + 8, y + 10, w - 16, min(d - 20, 60), 2, 4, h=4.2)
    _, x, y, w, d, *_ = zx["off"];   o += box(x + 4, y + 4, w - 8, d - 8, 22, "#D5DDE8", "#A7B4C6", op=.95)
    # dock doors: receiving on west wall, shipping on east wall
    wall_h = 32
    o += dock_doors("W", zx["recv"][2] + 8, 4 if site == "east" else 3, 16, W, D, wall_h)
    o += dock_doors("E", zx["out"][2] + 10, 6 if site == "east" else 4, 22, W, D, wall_h)
    # shell walls (back edges only, translucent so interior reads)
    for a, b in [((0,D),(W,D)), ((W,0),(W,D))]:
        p1, p2 = iso(*a), iso(*b); t1, t2 = iso(*a, wall_h), iso(*b, wall_h)
        o += f'<polygon points="{pts([p1,p2,t2,t1])}" fill="#EDF1F6" stroke="{LINE}" stroke-width="1" opacity=".45"/>'
    # labels last
    for key, x, y, w, d, name, sq in zones:
        o += zlabel(x, y, w, d, name, sq, fs=11.5 if site == "east" else 11)
    xs, ys = zip(*[iso(px, py, zz) for px in (0, W) for py in (0, D) for zz in (0, 40)])
    return o, (min(xs), min(ys), max(xs), max(ys)), (W, D)

def wrap_sub(sub, width=100):
    words, lines, cur = sub.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    return lines[:3]

def emit(fname, title, sub, body, vb, extra_h=84):
    x0, y0, x1, y1 = vb
    pad = 26
    vw = x1 - x0 + 2 * pad
    fs_t = min(16, vw / (0.64 * max(len(title), 1)))
    fs_s = max(9.5, min(11.5, fs_t * 0.72))
    wrap_chars = max(60, int(vw / (fs_s * 0.55)))
    subs = wrap_sub(sub, wrap_chars)
    vbs = f"{x0-pad:.0f} {y0-pad-extra_h:.0f} {vw:.0f} {y1-y0+2*pad+extra_h:.0f}"
    header = (f'<rect x="{x0-pad:.0f}" y="{y0-pad-extra_h:.0f}" width="{vw:.0f}" height="{extra_h-6:.0f}" '
              f'fill="#FBFCFE" opacity="0.94"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbs}" width="100%" '
           f'style="max-width:1150px;background:#FBFCFE;border:1px solid #DCE6F0;'
           f'border-radius:12px;font-family:Inter,system-ui,sans-serif">'
           f'{body}{header}'
           f'<text x="{x0-pad+22:.0f}" y="{y0-pad-extra_h+28:.0f}" font-size="{fs_t:.1f}" font-weight="700" fill="{INK}">{title}</text>'
           + ''.join(f'<text x="{x0-pad+22:.0f}" y="{y0-pad-extra_h+46+i*(fs_s+4):.0f}" font-size="{fs_s:.1f}" fill="{INK2}">{ln}</text>'
                      for i, ln in enumerate(subs))
           + '</svg>')
    with open(os.path.join(OUT, fname), "w") as f:
        f.write(svg)
    print("wrote", fname, len(svg), "bytes")

def crop(full_vb, fx0, fy0, fx1, fy1):
    """Fractional crop of the full extent box."""
    x0, y0, x1, y1 = full_vb
    return (x0 + (x1-x0)*fx0, y0 + (y1-y0)*fy0, x0 + (x1-x0)*fx1, y0 + (y1-y0)*fy1)

def site_plan(site):
    if site == "east":
        W, D, courtW, courtE, park = 250, 175, 130, 190, 44
        title = "East node - Hebron, KY  |  site plan  |  building 43,750 sq ft (250 x 175 ft)"
        acres = ((W + courtW + courtE) * (D + 115)) / 43560
    else:
        W, D, courtW, courtE, park = 175, 140, 120, 130, 22
        title = "West node - Las Vegas, NV  |  site plan  |  building 24,500 sq ft (175 x 140 ft)"
        acres = ((W + courtW + courtE) * (D + 105)) / 43560
    s = 1.9
    def R(x, y, w, h, fill, edge, rx=3):
        return (f'<rect x="{x*s:.0f}" y="{y*s:.0f}" width="{w*s:.0f}" height="{h*s:.0f}" '
                f'fill="{fill}" stroke="{edge}" stroke-width="1.2" rx="{rx}"/>')
    def T(x, y, txt, fs=12, w="700", fill=INK, anch="middle"):
        return f'<text x="{x*s:.0f}" y="{y*s:.0f}" font-size="{fs}" font-weight="{w}" fill="{fill}" text-anchor="{anch}">{txt}</text>'
    b = ""
    total_w, total_d = courtW + W + courtE, D + (115 if site == 'east' else 105)
    b += R(0, 0, total_w, total_d, "#F4F6F3", "#C9D3C6")                       # parcel
    b += R(courtW, 55, W, D, "#E9EDF3", LINE, 4)                               # building
    b += T(courtW + W/2, 55 + D/2 - 8, "Building")
    b += T(courtW + W/2, 55 + D/2 + 8, f"{W*D:,} sq ft ({W} x {D} ft)", 11, "400", INK2)
    b += R(6, 55, courtW - 12, D, "#E2E6EB", "#B9C2CC")                        # inbound court
    b += T(courtW/2, 55 + D/2 - 6, "Inbound truck court")
    b += T(courtW/2, 55 + D/2 + 9, f"{courtW} ft deep", 10.5, "400", INK2)
    b += R(courtW + W + 6, 55, courtE - 12, D, "#E2E6EB", "#B9C2CC")           # outbound court
    b += T(courtW + W + courtE/2, 68, "Outbound truck court")
    b += T(courtW + W + courtE/2, 82, f"{courtE} ft deep + trailer storage", 10.5, "400", INK2)
    for i in range(4):                                                          # stored trailers
        b += R(courtW + W + courtE - 46, 92 + i*30, 34, 12, "#CBD4DD", "#9FACB9", 2)
    b += T(courtW + W + courtE - 29, 92 + 4*30 + 12, "trailer storage", 9.5, "400", INK2)
    b += R(courtW - 30, 8, W + 60, 34, "#DCE2E9", "#AEB9C5")                    # parking
    b += T(courtW + W/2, 27, f"Staff parking - {park} spaces", 11)
    for i in range(min(park, 26)):
        b += R(courtW - 22 + i * ((W + 44) / 26), 12, 6, 11, "#B7C2CE", "#93A2B1", 1)
    b += T(8/1.9, (total_d + 14)/1.0/1.9*1.9/1.9*0 + total_d + 16, "", 1)  # noop keep structure
    vb = (-16, -46, total_w * s + 32, total_d * s + 70)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" width="100%" '
           f'style="max-width:1150px;background:#FBFCFE;border:1px solid #DCE6F0;border-radius:12px;'
           f'font-family:Inter,system-ui,sans-serif">'
           f'<text x="-2" y="-24" font-size="16" font-weight="700" fill="{INK}">{title}</text>'
           f'<text x="-2" y="-6" font-size="11.5" fill="{INK2}">Roughly {acres:.1f} acres. Cross-dock: inbound west, outbound east with trailer storage, staff parking across the front. Courts sized for 53 ft trailers.</text>'
           f'{b}</svg>')
    with open(os.path.join(OUT, f"view_site_{site}.svg"), "w") as f:
        f.write(svg)
    print(f"wrote view_site_{site}.svg", len(svg), "bytes")

def main():
    os.makedirs(OUT, exist_ok=True)
    # EAST
    body, vb, (W, D) = scene("east")
    emit("view_east_1.svg",
         "East node - Hebron, KY  |  43,750 sq ft  |  bulk-pick design",
         "View 1 of 4 - overview from the south-west. 250 x 175 ft, 32 ft clear. No forward pick: floor-level pallet faces in reserve racking feed Sure Sort. Grid 25 ft. Each zone labeled with sq ft.",
         body, vb)
    emit("view_east_2.svg",
         "East - receiving and reserve racking (bulk pick faces)  |  6,284 sq ft racking",
         "View 2 of 4 - four inbound doors, floor staging, 1,150 pallet positions across three runs. Floor level doubles as the bulk pick face; upper levels replenish it.",
         body, crop(vb, 0.0, 0.0, 0.62, 0.72))
    emit("view_east_3.svg",
         "East - Sure Sort and pack line  |  4,660 + 3,781 sq ft",
         "View 3 of 4 - bulk-picked totes induct at the near end; 130 ft bed drops to order bins; eight pack stations work the front face.",
         body, crop(vb, 0.10, 0.30, 0.78, 1.00))
    emit("view_east_4.svg",
         "East - outbound, mail staging and office  |  8,000 sq ft staging",
         "View 4 of 4 - six shipping doors, mail trays staged on pallets for presort collection, two-storey office block clear of the floor.",
         body, crop(vb, 0.45, 0.05, 1.00, 0.85))
    # WEST
    body, vb, _ = scene("west")
    emit("view_west_1.svg",
         "West node - Las Vegas, NV  |  24,500 sq ft  |  bulk-pick design",
         "View 1 of 2 - same flow at smaller scale: three inbound doors, two racking runs with floor-level bulk pick faces, 85 ft Sure Sort, four pack stations. Each zone labeled with sq ft.",
         body, vb)
    emit("view_west_2.svg",
         "West - Sure Sort, pack and outbound  |  3,170 + 1,387 + 4,500 sq ft",
         "View 2 of 2 - the working half: sorter, pack line and staging lanes to four shipping doors.",
         body, crop(vb, 0.25, 0.20, 1.00, 1.00))
    # SITE PLANS
    site_plan("east")
    site_plan("west")

if __name__ == "__main__":
    main()
