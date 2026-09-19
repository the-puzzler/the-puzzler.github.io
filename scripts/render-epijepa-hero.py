"""Plot labelled Imagenette projector embeddings from the repository export.

Source: the-puzzler/epijepa, commit eaef026,
embedding_analysis/data/imagenette_embeddings.npz.
The local subset retains the projector arrays, PCA scores, variance ratios and labels.
Run: python scripts/render-epijepa-hero.py (requires numpy and matplotlib).
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb, to_hex

ASSETS = Path(__file__).resolve().parents[1] / 'posts/epijepa/assets'
d = np.load(ASSETS / 'data/imagenette_projector_embeddings.npz', allow_pickle=False)
labels = d['labels']
assert len(labels) == 3925
assert np.array_equal(np.unique(labels), np.arange(10))
# Use the exported PCA of centred raw projector outputs, fitted per model.
order = np.random.default_rng(0).permutation(len(labels))
base = ['#2678a8', '#d77622', '#42924c', '#c34d54', '#8f65b0',
        '#98664f', '#c468a7', '#7b7c78', '#94952d', '#299da6']
plt.rcParams.update({'font.family': ['DejaVu Sans', 'Arial', 'sans-serif'],
                     'svg.fonttype': 'none', 'svg.hashsalt': 'epijepa-hero'})
for mode in ['light', 'dark']:
    colours = base if mode == 'light' else [to_hex(np.array(to_rgb(c))*.72 + .28) for c in base]
    ink, rule = ('#68625c', '#c5bfb2') if mode == 'light' else ('#b7ad94', '#55574d')
    for arm in ['epi', 'sigreg']:
        xy = d[f'{arm}_pca_projector'][:, :2]
        variance = d[f'{arm}_pca_var_projector'][:2]
        assert xy.shape == (len(labels), 2) and np.isfinite(xy).all()
        fig, ax = plt.subplots(figsize=(3.2, 3.2), dpi=160)
        fig.subplots_adjust(left=.17, right=.98, bottom=.16, top=.97)
        fig.patch.set_alpha(0)
        ax.set_facecolor('none')
        ax.scatter(xy[order, 0], xy[order, 1], s=4,
                   c=[colours[i] for i in labels[order]], alpha=.65, linewidths=0)
        ax.set(xlim=(-4.5,4.5), ylim=(-4.5,4.5), xticks=[-4,-2,0,2,4], yticks=[-4,-2,0,2,4])
        ax.set_aspect('equal')
        ax.set_xlabel(f'PC1 · {variance[0]:.1%}', fontsize=9, color=ink, labelpad=6)
        ax.set_ylabel(f'PC2 · {variance[1]:.1%}', fontsize=9, color=ink, labelpad=4)
        for spine in ax.spines.values():
            spine.set_color(rule)
            spine.set_linewidth(.6)
        ax.tick_params(length=0, pad=5, labelsize=9, colors=ink)
        fig.savefig(ASSETS / f'hero-{arm}-{mode}.svg', transparent=True, metadata={'Date':None})
        plt.close(fig)
print('Rendered class-coloured PCA projections of 3,925 validation images per model in both themes.')

# A fixed light palette and raster export for social previews and homepage cards.
fig = plt.figure(figsize=(12, 6.3), dpi=100, facecolor='#f9f7f1')
fig.text(.065, .91, 'EpiJEPA', fontsize=34, fontweight='bold', color='#2c2925', va='center')
fig.text(.065, .847, 'Learning structure without a Gaussian target', fontsize=17, color='#68625c')
fig.text(.935, .91, 'the-puzzler', fontsize=13, color='#68625c', ha='right', va='center')
for arm, left, title in [('epi', .095, 'Epiplexity'), ('sigreg', .535, 'SIGReg')]:
    ax = fig.add_axes([left, .115, .37, .615], facecolor='none')
    xy = d[f'{arm}_pca_projector'][:, :2]
    ax.scatter(xy[order, 0], xy[order, 1], s=7,
               c=[base[i] for i in labels[order]], alpha=.75, linewidths=0)
    ax.set(xlim=(-4.5,4.5), ylim=(-4.5,4.5))
    ax.set_aspect('equal')
    ax.axis('off')
    ax.set_title(title, fontsize=19, fontweight='bold', color='#2c2925', pad=7)
fig.text(.5, .055, 'Imagenette projector outputs · PCA · coloured by class',
         fontsize=12, color='#68625c', ha='center')
fig.savefig(ASSETS / 'epijepa-pca-share.png', dpi=100, facecolor=fig.get_facecolor())
plt.close(fig)
print('Rendered 1200 × 630 share card.')
