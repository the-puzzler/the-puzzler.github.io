"""Render blog figures from the EpiJEPA repo's saved JSON results.

Requires matplotlib. Run from any directory with:
    python scripts/render-epijepa-figures.py
The data snapshots in posts/epijepa/assets/data are copied without changes.
"""
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean, stdev

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import NullLocator

ASSETS = Path(__file__).resolve().parents[1] / 'posts/epijepa/assets'
DATA = ASSETS / 'data'
PALETTES = {
    'light': dict(ink='#302f29', muted='#716e64', grid='#ddd8cc', epi='#39745c', sig='#9b642b', control='#817d73', pure='#796594'),
    'dark': dict(ink='#ebdbb2', muted='#b3ad99', grid='#44483f', epi='#a1d2b5', sig='#e8b871', control='#b3ad99', pure='#bda9d7'),
}
plt.rcParams.update({
    'font.family': ['DejaVu Sans', 'Arial', 'sans-serif'], 'font.size': 13,
    'svg.fonttype': 'none', 'svg.hashsalt': 'epijepa-results',
    'axes.labelsize': 12, 'axes.labelpad': 8,
    'xtick.labelsize': 12, 'ytick.labelsize': 12,
})
validation = json.loads((DATA / 'cifar_validation.json').read_text())
test = json.loads((DATA / 'cifar_test.json').read_text())
imagenette = json.loads((DATA / 'imagenette.json').read_text())
pure = json.loads((DATA / 'pure_epiplexity.json').read_text())
groups = defaultdict(list)
for row in validation:
    groups[row['method'], row['beta']].append(row['backbone_val'])


def canvas(palette):
    fig, ax = plt.subplots(figsize=(4.8, 2.55), dpi=100)
    fig.subplots_adjust(left=.12, right=.96, bottom=.25, top=.92)
    fig.patch.set_alpha(0)
    ax.set_facecolor('none')
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(axis='both', length=0, pad=6, colors=palette['muted'])
    ax.xaxis.label.set_color(palette['muted'])
    ax.yaxis.label.set_color(palette['muted'])
    ax.set_axisbelow(True)
    ax.grid(axis='y', color=palette['grid'], linewidth=.7)
    return fig, ax


def save(fig, name, theme):
    fig.savefig(ASSETS / f'{name}-{theme}.svg', transparent=True,
                metadata={'Date': None, 'Creator': 'EpiJEPA figure renderer'})
    plt.close(fig)


for theme, p in PALETTES.items():
    fig, ax = canvas(p)
    weights = sorted(b for method, b in groups if method == 'epi')
    values = [mean(groups['epi', b]) for b in weights]
    errors = [stdev(groups['epi', b]) for b in weights]
    ax.set_xscale('log')
    ax.set_xlim(.023, 13)
    ax.set_ylim(44, 84)
    ax.set_yticks([50, 60, 70, 80])
    ax.set_xticks([.03, .1, .3, 1, 3, 10], ['.03', '.1', '.3', '1', '3', '10'])
    ax.xaxis.set_minor_locator(NullLocator())
    ax.set_xlabel('Weight β · log scale')
    ax.text(0, 1.025, 'Validation accuracy (%)', transform=ax.transAxes, color=p['muted'], fontsize=12)
    for method, label, colour, dash in [('sigreg', 'SIGReg', p['sig'], (5, 4)), ('align', 'Alignment only', p['control'], (2, 4))]:
        best = max(mean(xs) for (m, b), xs in groups.items() if m == method)
        ax.axhline(best, color=colour, linewidth=1.3, dashes=dash)
        ax.text(.027, best + 1.2, f'{label}  {best:.2f}', color=colour, fontsize=11)
    ax.errorbar(weights, values, yerr=errors, color=p['epi'], linewidth=2, marker='o', markersize=5.5, capsize=3, capthick=1.2, zorder=3)
    ax.annotate('EpiJEPA', xy=(1, values[weights.index(1)]), xytext=(1.5, 76), color=p['epi'], fontsize=12, fontweight='bold')
    save(fig, 'cifar-sweep', theme)

    # A compact, shared 0–100 scale for the main dataset comparison.
    for dataset in ['cifar', 'imagenette']:
        fig, ax = plt.subplots(figsize=(4.8, 2.7), dpi=100)
        fig.subplots_adjust(left=.035, right=.965, bottom=.14, top=.98)
        fig.patch.set_alpha(0)
        ax.set_facecolor('none')
        ax.set_xlim(0, 100)
        ax.set_ylim(-.48, 3.65)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.set_yticks([])
        ax.set_xticks([0, 50, 100], ['0', '50', '100%'])
        ax.tick_params(axis='x', length=0, pad=6, colors=p['muted'], labelsize=10)
        for i, (method, label, colour) in enumerate([
            ('align', 'Alignment only', p['control']),
            ('pure', 'Epiplexity only', p['pure']),
            ('epi', 'EpiJEPA', p['epi']),
            ('sigreg', 'SIGReg', p['sig']),
        ]):
            if method == 'pure':
                mu = pure[dataset]['backbone_val_mean' if dataset == 'cifar' else 'offline_linear']
                sd = pure[dataset]['backbone_val_sd'] if dataset == 'cifar' else 0
                number = f'{mu:.2f} ± {sd:.2f}' if dataset == 'cifar' else f'{mu:.2f}'
            elif dataset == 'cifar':
                # Use validation throughout: the pure-score run has no saved test result.
                selected_beta = next(r['beta'] for r in test if r['method'] == method)
                values = groups[method, selected_beta]
                mu, sd = mean(values), stdev(values)
                number = f'{mu:.2f} ± {sd:.2f}'
            else:
                row = next(r for r in imagenette if r['method'] == method and
                           (method != 'epi' or r['lamb'] == .1))
                mu, sd = row['offline_linear'], 0
                number = f'{mu:.2f}'
            y = 3-i
            ax.barh(y, 100, height=.14, color=p['grid'], alpha=.45, linewidth=0)
            ax.barh(y, mu, height=.14, color=colour, linewidth=0)
            if sd:
                ax.errorbar(mu, y, xerr=sd, color=p['ink'], linewidth=1, capsize=3, capthick=1)
            ax.text(0, y+.25, label, color=colour, fontsize=12.5,
                    fontweight='bold' if method == 'epi' else 'normal')
            ax.text(100, y+.25, number, color=p['ink'], fontsize=12.5,
                    ha='right', fontweight='bold' if method == 'epi' else 'normal')
        save(fig, f'{dataset}-comparison', theme)

    epi = sorted((r for r in imagenette if r['method'] == 'epi'), key=lambda r: r['lamb'])
    sig = next(r for r in imagenette if r['method'] == 'sigreg')
    for metric, name, marker in [('online_final', 'imagenette-online', 'o'), ('offline_linear', 'imagenette-frozen', 'D')]:
        fig, ax = canvas(p)
        xs, ys = [r['lamb'] for r in epi], [r[metric] for r in epi]
        ax.set_xscale('log')
        ax.set_xlim(.016, 1.04)
        ax.set_ylim(81, 92)
        ax.set_xticks(xs, ['.02', '.05', '.1', '.2', '.4', '.8'])
        ax.xaxis.set_minor_locator(NullLocator())
        ax.set_yticks([82, 86, 90])
        ax.set_xlabel('Weight λ · log scale')
        ax.text(0, 1.025, 'Validation accuracy (%)', transform=ax.transAxes, color=p['muted'], fontsize=12)
        ax.axhline(sig[metric], color=p['sig'], linewidth=1.4, dashes=(5, 4))
        ax.text(.018, sig[metric]+.45, f'SIGReg  {sig[metric]:.2f}', color=p['sig'], fontsize=12)
        ax.plot(xs, ys, color=p['epi'], linewidth=2, marker=marker, markersize=5.5)
        best = max(epi, key=lambda r: r[metric])
        ax.annotate(f'{best[metric]:.2f}', xy=(best['lamb'], best[metric]), xytext=(0, 13), textcoords='offset points', ha='center', color=p['epi'], fontsize=12, fontweight='bold')
        ax.text(.8, ys[-1]-1.2, 'EpiJEPA', ha='right', color=p['epi'], fontsize=12, fontweight='bold')
        save(fig, name, theme)
print('Rendered ten SVGs: two comparisons and three sweeps in light and dark palettes.')
