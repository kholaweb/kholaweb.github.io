# -*- coding: utf-8 -*-
"""Rassemble le dossier a televerser sur hdehaan.pages-perso.free.fr.

Chez free.fr, la racine FTP est la racine du site : ce que l'on depose a la
racine est servi a hdehaan.pages-perso.free.fr/<chemin>. Le script recopie
donc dans <sortie>/site/ exactement les fichiers a deposer, en conservant
l'arborescence du depot -- il suffit d'envoyer le CONTENU de site/ a la
racine, l'ancienne arborescence electricite/, mecanique/... restant en place
a cote et continuant de servir les exercices non encore convertis.

  python scripts/preparer-free.py [dossier de sortie]

Par defaut : ..\\kholaweb-publication-free, a cote du depot.

<sortie>/liste.txt, hors du dossier a televerser, recense ce qui a change
depuis la preparation precedente : seuls ces fichiers-la sont a renvoyer.
"""
import hashlib, shutil, sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE.parent / 'kholaweb-publication-free'
SITE = SORTIE / 'site'


def fichiers():
    """Ce que le site en ligne doit recevoir.

    Restent dans le depot : les outils de scripts/, .nojekyll (propre a
    GitHub Pages), data/, package.json, node_modules/ et Word/.
    """
    yield RACINE / 'index.htm'
    yield RACINE / 'css' / 'protection.css'
    yield RACINE / 'scripts' / 'protection.js'
    for dossier in ('exercices', 'img'):
        for p in sorted((RACINE / dossier).rglob('*')):
            # ~$... et ~WRL... : fichiers temporaires de Word
            if p.is_file() and not p.name.startswith('~'):
                yield p


def empreinte(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


nouveaux, modifies, inchanges, attendus = [], [], [], set()

for src in fichiers():
    rel = src.relative_to(RACINE)
    attendus.add(rel)
    dest = SITE / rel
    if not dest.exists():
        etat = nouveaux
    elif empreinte(dest) != empreinte(src):
        etat = modifies
    else:
        etat = inchanges
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    etat.append(rel)

# un fichier retire du depot reste sur le serveur : le signaler, sans rien
# supprimer nous-memes du cote distant
obsoletes = []
if SITE.exists():
    for p in sorted(SITE.rglob('*')):
        if p.is_file() and p.relative_to(SITE) not in attendus:
            obsoletes.append(p.relative_to(SITE))
            p.unlink()

poids = sum((SITE / r).stat().st_size for r in attendus)

lignes = ['Publication KholaWeb sur hdehaan.pages-perso.free.fr', '']
lignes.append('A televerser : le CONTENU du dossier site\\, a la racine du site.')
lignes.append('Ne pas televerser ce fichier-ci.')
lignes.append('')
for titre, groupe in (('A ENVOYER -- nouveaux', nouveaux),
                      ('A ENVOYER -- modifies', modifies),
                      ('Inchanges depuis la derniere preparation', inchanges),
                      ('Retires du depot -- a supprimer sur le serveur', obsoletes)):
    lignes.append('%s (%d)' % (titre, len(groupe)))
    lignes += ['    ' + str(r) for r in groupe] or ['    (aucun)']
    lignes.append('')
lignes.append('Total depose dans site\\ : %d fichiers, %.1f Mo' % (len(attendus), poids / 1e6))

(SORTIE / 'liste.txt').write_text('\n'.join(lignes), encoding='utf8')

print('Dossier pret : %s' % SITE)
print('  a envoyer : %d nouveaux, %d modifies' % (len(nouveaux), len(modifies)))
print('  inchanges : %d' % len(inchanges))
if obsoletes:
    print('  a supprimer sur le serveur : %d' % len(obsoletes))
print('  total     : %d fichiers, %.1f Mo' % (len(attendus), poids / 1e6))
print('Liste detaillee : %s' % (SORTIE / 'liste.txt'))
