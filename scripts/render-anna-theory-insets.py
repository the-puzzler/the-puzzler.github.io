"""Render the two cluster insets in the Theory section of Beautiful on the Inside.

python3 scripts/render-anna-theory-insets.py OUT_DIR
Writes k-neighbourhoods.html and k-by-depth.html (figure markup to paste into the post).
The activations are made up for illustration, not taken from a trained network.
"""
import os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else "."

import math, random
random.seed(4)
centres=[(48,62,8),(100,100,9),(52,146,8),(176,58,8),(186,136,8)]
pts=[];lab=[]
for c,(cx,cy,n) in enumerate(centres):
    for i in range(n):
        a=random.random()*2*math.pi; r=abs(random.gauss(0,1))*9
        pts.append((cx+r*math.cos(a),cy+r*math.sin(a))); lab.append(c)
def fit(P,margin):
    cx=sum(x for x,_ in P)/len(P); cy=sum(y for _,y in P)/len(P)
    sxx=sum((x-cx)**2 for x,_ in P); syy=sum((y-cy)**2 for _,y in P); sxy=sum((x-cx)*(y-cy) for x,y in P)
    th=0.5*math.atan2(2*sxy,sxx-syy)
    u=[((x-cx)*math.cos(th)+(y-cy)*math.sin(th), -(x-cx)*math.sin(th)+(y-cy)*math.cos(th)) for x,y in P]
    rx=max(abs(a) for a,_ in u)+margin; ry=max(abs(b) for _,b in u)+margin
    s=max(math.hypot(a/rx,b/ry) for a,b in u)
    rx*=max(1,s); ry*=max(1,s)
    m=max(rx,ry)*.55; rx=max(rx,m); ry=max(ry,m)
    return cx,cy,rx,ry,th
def ell(e):
    cx,cy,rx,ry,th=e
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" transform="rotate({math.degrees(th):.1f} {cx:.1f} {cy:.1f})"/>'
def panel(groups,dx,size,margin):
    S=[(x+dx,y) for x,y in pts]
    E=[fit([p for p,l in zip(S,lab) if l in g],margin) for g in groups]
    return ('        <g opacity=".6">'+''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3"/>' for x,y in S)+'</g>\n'
            '        <g fill="none" stroke="currentColor" stroke-width="1.4">'+''.join(ell(e) for e in E)+'</g>\n'
            f'        <text x="{dx+120:.0f}" y="20" text-anchor="middle" font-size="17">{size} <tspan font-style="italic">k</tspan></text>\n')
svg=f'''  <figure class="theory-inset theory-inset--left" id="k-neighbourhoods">
    <svg viewBox="6 2 474 168" role="img" aria-labelledby="k-neighbourhoods-title">
      <title id="k-neighbourhoods-title">Small k aligns activations within each cluster; large k aligns several clusters together</title>
      <g fill="currentColor">
{panel([[0],[1],[2],[3],[4]],0,'small',8)}{panel([[0,1,2],[3,4]],250,'large',9)}      </g>
    </svg>
    <figcaption>Outlines mark activations that are aligned, and so pushed to share computation.</figcaption>
  </figure>
'''
open(os.path.join(OUT,'k-neighbourhoods.html'),'w').write(svg)

# --- k by depth ---
random.seed(11)
gx=sum(x for x,_ in pts)/len(pts); gy=sum(y for _,y in pts)/len(pts)
# an unseparated layer: every point scattered around the middle, independent of its cluster
scatter=[]
for _ in pts:
    a=random.random()*2*math.pi; r=math.sqrt(random.random())
    scatter.append((gx+r*62*math.cos(a),gy+r*50*math.sin(a)))
def layer(alpha):
    return [(s[0]+(p[0]-s[0])*alpha,s[1]+(p[1]-s[1])*alpha) for s,p in zip(scatter,pts)]
W=250
def panel(i,alpha,groups,margin,title):
    dx=i*W; P=[(x+dx,y) for x,y in layer(alpha)]
    E=[fit([p for p,l in zip(P,lab) if l in g],margin) for g in groups]
    return ('        <g opacity=".6">'+''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3"/>' for x,y in P)+'</g>\n'
            '        <g fill="none" stroke="currentColor" stroke-width="1.4">'+''.join(ell(e) for e in E)+'</g>\n'
            f'        <text x="{dx+118:.0f}" y="20" text-anchor="middle" font-size="18">{title}</text>\n')
K='<tspan font-style="italic">k</tspan>'
body=(panel(0,.12,[[0,1,2,3,4]],8,f'Early layer, large {K}')
     +panel(1,.6,[[0,1,2],[3,4]],9,'Middle layer')
     +panel(2,1,[[0],[1],[2],[3],[4]],8,f'Late layer, small {K}'))
arrows=''.join(f'<path d="M{i*W-16} 96h22m-4-3.5 4 3.5-4 3.5"/>' for i in (1,2))
svg=f'''  <figure id="k-by-depth">
    <svg viewBox="2 2 {3*W-6} 170" role="img" aria-labelledby="k-by-depth-title">
      <title id="k-by-depth-title">The same activations at three depths. Early on they are mixed together and one broad outline aligns them all. Deeper in, they separate into clusters and the outlines shrink to match.</title>
      <g fill="currentColor">
{body}      </g>
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity=".6">{arrows}</g>
    </svg>
    <figcaption>As activations separate with layer depth, <i>k</i> shrinks to match.</figcaption>
  </figure>
'''
open(os.path.join(OUT,'k-by-depth.html'),'w').write(svg)
