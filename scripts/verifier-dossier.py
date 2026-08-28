# -*- coding: utf-8 -*-
"""Dit si un dossier source est en état d'être converti en page web.

Une page se fabrique à partir de deux choses, et de deux seulement :

  · un .docx dont le nom porte le mot « latex » — la version convertie par
    MathType, dont les formules sont du LaTeX en clair. Les fichiers d'origine
    portent des objets Equation Editor 3.0, du binaire dont rien ne s'extrait ;
  · les SVG des schémas, tracés sous CorelDRAW. Les images du document sont en
    noir sur blanc et de deux cents pixels de large : elles ne conviennent ni à
    l'écran d'aujourd'hui ni au mode sombre.

Sans ces deux-là, il n'y a pas de page à faire, et ce script le dit plutôt que
de laisser la découverte pour plus tard.

Il rapporte en outre, pour chaque dessin, ce qui décidera de sa mise en page :
l'échelle interne de l'export, qui varie d'un dessin à l'autre, et les couleurs
fixes que la conversion ne saura pas rendre au mode sombre.

Usage :
    python scripts/verifier-dossier.py Word/electricite/e_1/e_1_5
    python scripts/verifier-dossier.py Word/electricite/e_1          # tout le chapitre

Devant tout appel, PYTHONIOENCODING=utf-8 : la console est en cp1252 et les
caractères de cadre la font échouer.
"""

import os
import re
import sys
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# docx-formules.py n'est pas un nom de module importable : on charge à la main
import importlib.util


def charger_lecteur():
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          'docx-formules.py')
    spec = importlib.util.spec_from_file_location('docx_formules', chemin)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LECTEUR = charger_lecteur()


def examiner_docx(chemin):
    """Ce qu'on peut tirer d'un document : formules, questions, images."""
    try:
        paragraphes = LECTEUR.lire(chemin)
    except Exception as e:
        return {'erreur': str(e)}
    formules = LECTEUR.formules(paragraphes)
    return {
        'paragraphes': len(paragraphes),
        'questions': sum(1 for p in paragraphes if p['numerote']),
        'formules': len(formules),
        'images': sum(p['texte'].count('[IMAGE]') for p in paragraphes),
    }


def examiner_svg(chemin):
    """Échelle de l'export et couleurs qui ne suivront pas le mode sombre."""
    s = open(chemin, encoding='utf8', errors='replace').read()

    vb = re.search(r'viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.]+)\s+([\d.]+)"', s)
    largeur_mm = re.search(r'\swidth="([\d.]+)mm"', s)
    traits = sorted(set(float(x) for x in re.findall(r'stroke-width:([\d.]+)', s)))

    info = {
        'vb': (float(vb.group(3)), float(vb.group(4))) if vb else None,
        'mm': float(largeur_mm.group(1)) if largeur_mm else None,
        'traits': traits,
        'textes': len(re.findall(r'<text\b', s)),
    }
    if info['vb'] and info['mm']:
        info['unites_par_mm'] = info['vb'][0] / info['mm']

    # ce que svg-corel.py sait convertir ; le reste resterait fixe en mode sombre
    connues = {'#A10115', '#DBCEDE', '#000000', '#000', 'black'}
    fixes = set()
    for m in re.finditer(r'(?:fill|stroke):(#[0-9A-Fa-f]{3,8}|black)', s):
        if m.group(1).upper() not in {c.upper() for c in connues}:
            fixes.add(m.group(1))
    info['couleurs_fixes'] = sorted(fixes)
    return info


def verifier(dossier):
    nom = os.path.basename(dossier.rstrip('/\\'))
    print('\n=== %s' % nom)

    docx = [f for f in glob.glob(os.path.join(dossier, '*.docx'))
            if not os.path.basename(f).startswith('~$')]
    latex = [f for f in docx if 'latex' in os.path.basename(f).lower()]
    svg = glob.glob(os.path.join(dossier, '*.svg'))

    manques = []

    if latex:
        for f in latex:
            r = examiner_docx(f)
            if 'erreur' in r:
                print('  document  %-34s illisible : %s'
                      % (os.path.basename(f), r['erreur']))
                manques.append('le document latex ne s\'ouvre pas')
                continue
            print('  document  %-34s %d formules, %d questions numérotées, %d images'
                  % (os.path.basename(f), r['formules'], r['questions'], r['images']))
            if not r['formules']:
                manques.append('le document latex ne contient aucune formule '
                               'extractible — conversion MathType incomplète ?')
    else:
        if docx:
            print('  document  aucun fichier « latex » ; %d document(s) d\'origine :'
                  % len(docx))
            for f in docx[:6]:
                r = examiner_docx(f)
                if 'erreur' in r:
                    continue
                print('              %-32s %d formules, %d images'
                      % (os.path.basename(f), r['formules'], r['images']))
        else:
            print('  document  aucun .docx')
        manques.append('le .docx converti par MathType, dont le nom porte « latex »')

    if svg:
        for f in sorted(svg):
            i = examiner_svg(f)
            echelle = ('%.1f unités/mm' % i['unites_par_mm']
                       if i.get('unites_par_mm') else 'échelle inconnue')
            largeur = ('%.1f mm' % i['mm']) if i['mm'] else '?'
            print('  dessin    %-34s %s, %s, %d libellés <text>'
                  % (os.path.basename(f), largeur, echelle, i['textes']))
            if i['couleurs_fixes']:
                print('              ⚠ couleurs que la conversion ne sait pas '
                      'rendre au mode sombre : %s' % ', '.join(i['couleurs_fixes']))
    else:
        print('  dessin    aucun .svg')
        # un exercice peut n'avoir aucun schéma : on ne le compte pas comme
        # manquant, mais on le signale, la réponse appartenant à l'auteur
        print('              (si l\'exercice comporte un schéma, il manque)')

    if manques:
        print('  → à compléter : %s' % ' ; '.join(manques))
    else:
        print('  → prêt')
    return not manques


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    cible = sys.argv[1].rstrip('/\\')
    if not os.path.isdir(cible):
        print('%s n\'est pas un dossier' % cible)
        return 1

    # un dossier d'exercice contient des fichiers ; un dossier de chapitre, des
    # dossiers d'exercice
    sous = sorted(d for d in glob.glob(os.path.join(cible, '*'))
                  if os.path.isdir(d))
    if sous:
        prets = sum(1 for d in sous if verifier(d))
        print('\n%d dossier(s) prêt(s) sur %d.' % (prets, len(sous)))
    else:
        verifier(cible)
    return 0


if __name__ == '__main__':
    sys.exit(main())
