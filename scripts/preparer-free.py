# -*- coding: utf-8 -*-
"""Rassemble le dossier a televerser sur hdehaan.pages-perso.free.fr.

Chez free.fr, la racine FTP est la racine du site : ce que l'on depose a la
racine est servi a hdehaan.pages-perso.free.fr/<chemin>. Le script recopie
donc dans <sortie>/site/ exactement les fichiers a deposer, en conservant
l'arborescence du depot -- il suffit d'envoyer le CONTENU de site/ a la
racine, l'ancienne arborescence electricite/, mecanique/... restant en place
a cote et continuant de servir les exercices non encore convertis.

  python scripts/preparer-free.py [dossier de sortie]
  python scripts/preparer-free.py --publie [dossier de sortie]

Par defaut : ..\\kholaweb-publication-free, a cote du depot.

<sortie>/liste.txt, hors du dossier a televerser, recense ce qui reste a
envoyer. La comparaison porte sur l'etat du dernier televersement, note dans
<sortie>/etat-publie.json, et non sur la preparation precedente : sans cela,
relancer le script deux fois de suite effacerait la liste des fichiers a
envoyer alors qu'ils n'ont pas quitte la machine. C'est arrive le 26 aout 2026.

Une fois les fichiers deposes sur free.fr, le confirmer par :

  python scripts/preparer-free.py --publie

qui enregistre l'etat courant comme etant celui du serveur. Tant que cette
confirmation n'est pas donnee, les fichiers restent annonces comme a envoyer.
"""
import hashlib, json, shutil, sys
from pathlib import Path

arguments = [a for a in sys.argv[1:] if not a.startswith('--')]
PUBLIE = '--publie' in sys.argv

RACINE = Path(__file__).resolve().parent.parent
SORTIE = Path(arguments[0]) if arguments else RACINE.parent / 'kholaweb-publication-free'
SITE = SORTIE / 'site'
ETAT = SORTIE / 'etat-publie.json'


def fichiers():
    """Ce que le site en ligne doit recevoir.

    Restent dans le depot : les outils de scripts/, .nojekyll (propre a
    GitHub Pages), data/, package.json, node_modules/ et Word/.
    """
    yield RACINE / 'index.htm'
    # .htaccess ne sert qu'a free.fr : il y supprime le cache des pages, que
    # l'hebergeur ne pilote par aucun en-tete. GitHub Pages ne le lit pas.
    yield RACINE / '.htaccess'
    # page de rubrique de l'ancien site, entree au depot le 26 aout 2026 :
    # ses liens E1.1 a E1.4 menent desormais vers les nouvelles pages
    yield RACINE / 'page_base_electricite.htm'
    yield RACINE / 'css' / 'protection.css'
    yield RACINE / 'scripts' / 'protection.js'
    for dossier in ('exercices', 'img'):
        for p in sorted((RACINE / dossier).rglob('*')):
            # ~$... et ~WRL... : fichiers temporaires de Word
            if p.is_file() and not p.name.startswith('~'):
                yield p


def empreinte(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


publie = {}
if ETAT.exists():
    publie = json.loads(ETAT.read_text(encoding='utf8'))

nouveaux, modifies, inchanges, attendus, courant = [], [], [], set(), {}

for src in fichiers():
    rel = src.relative_to(RACINE)
    cle = str(rel).replace('\\', '/')
    attendus.add(rel)
    courant[cle] = empreinte(src)

    if cle not in publie:
        nouveaux.append(rel)
    elif publie[cle] != courant[cle]:
        modifies.append(rel)
    else:
        inchanges.append(rel)

    dest = SITE / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)

# un fichier retire du depot reste sur le serveur : le signaler, sans rien
# supprimer nous-memes du cote distant
obsoletes = sorted(set(publie) - set(courant))
if SITE.exists():
    for p in sorted(SITE.rglob('*')):
        if p.is_file() and p.relative_to(SITE) not in attendus:
            p.unlink()

poids = sum((SITE / r).stat().st_size for r in attendus)

if PUBLIE:
    ETAT.write_text(json.dumps(courant, indent=1, sort_keys=True), encoding='utf8')
    print('Etat enregistre : les %d fichiers de site\\ sont ceux du serveur.'
          % len(courant))
    print('La prochaine preparation ne signalera que ce qui aura change depuis.')
    sys.exit(0)

lignes = ['Publication KholaWeb sur hdehaan.pages-perso.free.fr', '']
lignes.append('A televerser : le CONTENU du dossier site\\, a la racine du site.')
lignes.append('Ne pas televerser ce fichier-ci.')
lignes.append('')
lignes.append('Une fois le depot fait, le confirmer par :')
lignes.append('    python scripts/preparer-free.py --publie')
lignes.append("sans quoi ces fichiers resteront annonces comme a envoyer.")
lignes.append('')
for titre, groupe in (('A ENVOYER -- jamais deposes', nouveaux),
                      ('A ENVOYER -- modifies depuis le dernier depot', modifies),
                      ('Deja en ligne, inchanges', inchanges),
                      ('Retires du depot -- a supprimer sur le serveur', obsoletes)):
    lignes.append('%s (%d)' % (titre, len(groupe)))
    lignes += ['    ' + str(r) for r in groupe] or ['    (aucun)']
    lignes.append('')
lignes.append('Total depose dans site\\ : %d fichiers, %.1f Mo' % (len(attendus), poids / 1e6))

(SORTIE / 'liste.txt').write_text('\n'.join(lignes), encoding='utf8')

print('Dossier pret : %s' % SITE)
if not ETAT.exists():
    print('  (aucun etat de publication connu : tout est annonce comme a envoyer)')
print('  a envoyer : %d jamais deposes, %d modifies' % (len(nouveaux), len(modifies)))
print('  deja en ligne : %d' % len(inchanges))
if obsoletes:
    print('  a supprimer sur le serveur : %d' % len(obsoletes))
print('  total     : %d fichiers, %.1f Mo' % (len(attendus), poids / 1e6))
print('Liste detaillee : %s' % (SORTIE / 'liste.txt'))
