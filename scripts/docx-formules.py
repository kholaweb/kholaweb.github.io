#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrait d'un document Word la structure du texte et les formules LaTeX.

Un .docx est un zip : le corps du document est dans word/document.xml. On y lit
trois choses qui comptent pour fabriquer une page d'exercice :

  · le texte des paragraphes, avec les sauts de ligne (w:br) et les tabulations
    (w:tab) — ces dernières portent le retrait des formules dans le document ;
  · les paragraphes réellement numérotés (w:numPr), qui donnent le découpage des
    questions de l'énoncé — l'apparence imprimée ne suffit pas à le deviner ;
  · les formules.

Deux sortes de documents circulent dans Word/ :

  · les fichiers convertis par MathType, suffixés « _latexdocx ». Les formules y
    sont du LaTeX en clair entre $…$ ou \\[…\\], donc extractibles telles quelles.
    C'est la source à privilégier ;
  · les fichiers d'origine, dont les formules sont des objets Equation Editor 3.0
    — du binaire OLE avec un aperçu WMF. Rien à extraire : le script le signale
    et il faut alors convertir les aperçus en images pour les lire.

Usage :
    python scripts/docx-formules.py <fichier.docx>              # rapport lisible
    python scripts/docx-formules.py <fichier.docx> --json <f>   # + formules JSON

Le JSON produit alimente scripts/verifier-page.js, qui confronte la page web
obtenue aux formules du document.
"""

import sys
import re
import json
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
MATH = 'http://schemas.openxmlformats.org/officeDocument/2006/math'


def nom(element):
    return element.tag.split('}')[-1]


def espace(element):
    return element.tag.split('}')[0][1:] if '}' in element.tag else ''


def texte_paragraphe(p):
    """Texte d'un paragraphe, avec des repères pour ce qui n'est pas du texte."""
    morceaux = []

    def parcours(noeud):
        for enfant in noeud:
            etiquette = nom(enfant)
            if espace(enfant) == MATH:
                # équation native Word (OMML) : convertible, mais on ne la
                # rencontre pas dans ce fonds documentaire
                morceaux.append('[OMML]')
                continue
            if etiquette == 't':
                morceaux.append(enfant.text or '')
            elif etiquette == 'br':
                morceaux.append('\n')
            elif etiquette == 'tab':
                morceaux.append('\t')
            elif etiquette in ('drawing', 'pict', 'object'):
                morceaux.append('[IMAGE]')
            else:
                parcours(enfant)

    parcours(p)
    return ''.join(morceaux)


def lire(chemin):
    z = zipfile.ZipFile(chemin)
    racine = ET.fromstring(z.read('word/document.xml'))
    corps = racine.find(W + 'body')

    paragraphes = []
    for p in corps.iter(W + 'p'):
        pPr = p.find(W + 'pPr')
        numerote = pPr is not None and pPr.find(W + 'numPr') is not None
        style = ''
        if pPr is not None:
            ps = pPr.find(W + 'pStyle')
            if ps is not None:
                style = ps.get(W + 'val') or ''
        paragraphes.append({
            'numerote': numerote,
            'style': style,
            'texte': texte_paragraphe(p),
        })
    return paragraphes


def formules(paragraphes):
    """Repère les formules LaTeX. Elles peuvent enjamber plusieurs paragraphes :
    MathType coupe les blocs \\begin{align} par des sauts de paragraphe."""
    tout = '\n'.join(p['texte'] for p in paragraphes)
    trouvees = []
    for m in re.finditer(r'\\\[(.+?)\\\]|\$(.+?)\$', tout, re.S):
        display = m.group(1) is not None
        source = m.group(1) if display else m.group(2)
        trouvees.append({'display': display, 'tex': ' '.join(source.split())})
    return trouvees


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    chemin = sys.argv[1]
    paragraphes = lire(chemin)
    eqs = formules(paragraphes)
    images = sum(p['texte'].count('[IMAGE]') for p in paragraphes)

    print('Document : %s' % chemin)
    print('  paragraphes            : %d' % len(paragraphes))
    print('  dont numérotés         : %d  (questions de l\'énoncé)'
          % sum(1 for p in paragraphes if p['numerote']))
    print('  formules LaTeX         : %d' % len(eqs))
    print('  objets image / OLE     : %d' % images)
    print()

    if not eqs and images:
        print('  ⚠ Formules non extractibles : ce sont des objets Equation 3.0.')
        print('    Demander la version convertie par MathType (« _latexdocx »),')
        print('    ou convertir les aperçus WMF en images pour les lire.')
    elif eqs:
        numeros = []
        for eq in eqs:
            numeros += re.findall(r'\\left\(\s*(\d+)\s*\\right\)\s*(?=$|\\\\)', eq['tex'])
        if numeros:
            print('  numéros d\'équation, dans l\'ordre : %s' % ' '.join(numeros))
            attendu = [str(i) for i in range(1, len(numeros) + 1)]
            if numeros != attendu:
                print('  ⚠ La numérotation du document n\'est pas continue.')
            print()

    print('── Structure ──')
    for i, p in enumerate(paragraphes, 1):
        t = p['texte'].strip()
        if not t:
            continue
        marque = '%2d.' % sum(1 for q in paragraphes[:i] if q['numerote']) if p['numerote'] else '   '
        apercu = t.replace('\n', ' ⏎ ').replace('\t', ' → ')
        print('%s %-12s %s' % (marque, p['style'][:12], apercu[:100]))

    if '--json' in sys.argv:
        sortie = sys.argv[sys.argv.index('--json') + 1]
        with open(sortie, 'w', encoding='utf8') as f:
            json.dump(eqs, f, ensure_ascii=False, indent=1)
        print('\n%d formules écrites dans %s' % (len(eqs), sortie))

    return 0


if __name__ == '__main__':
    sys.exit(main())
