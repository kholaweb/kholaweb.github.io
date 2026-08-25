# -*- coding: utf-8 -*-
"""Prepare un SVG CorelDRAW pour etre inline dans une page KholaWeb.

  - supprime <defs> (polices SVG 1.1, ignorees des navigateurs, ~70% du poids)
  - supprime les regles @font-face qui les referencent
  - prefixe toutes les classes, les deux fichiers en definissant d'identiques
    aux valeurs differentes
  - noir -> currentColor, #A10115 -> var(--bordeaux) : le schema suit le theme
  - polices du dessin -> var(--serif), celles d'origine n'etant pas installees
"""
import re, sys

src, prefixe, sortie = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf8').read()

# les polices SVG 1.1 sont ignorees des navigateurs : on ne garde que le reste
# de <defs>, ou vivent aussi le bloc <style> et les clipPath, indispensables
avant = len(s)
s = re.sub(r'<font\s[^>]*>.*?</font>', '', s, flags=re.S)
s = re.sub(r'<missing-glyph[^>]*/>|<missing-glyph[^>]*>.*?</missing-glyph>', '', s, flags=re.S)

s = re.sub(r'@font-face\s*\{[^}]*\}', '', s)
s = re.sub(r'<\?xml[^>]*\?>|<!DOCTYPE[^>]*>', '', s)
s = re.sub(r'<!--.*?-->', '', s, flags=re.S)

classes = sorted(set(re.findall(r'\.((?:str|fil|fnt)\d+)\s*\{', s)), key=len, reverse=True)
for c in classes:
    s = re.sub(r'\.' + c + r'(?=[\s{,])', '.' + prefixe + c, s)
    s = re.sub(r'(class="[^"]*?)\b' + c + r'\b', r'\1' + prefixe + c, s)
    s = re.sub(r'(class="[^"]*?)\b' + c + r'\b', r'\1' + prefixe + c, s)


# Le dessin est exporte pour une largeur de 124 mm ; ramene a la colonne de
# lecture, stroke-width:14 ne fait plus que 0,77 pixel. On epaissit d'un facteur
# unique, les proportions entre traits restant celles de l'auteur.
EPAISSIR = 1.75
s = re.sub(r'stroke-width:([\d.]+)',
           lambda m: 'stroke-width:%.2f' % (float(m.group(1)) * EPAISSIR), s)

s = s.replace('stroke:black', 'stroke:currentColor')
s = s.replace('fill:black', 'fill:currentColor')
s = s.replace('fill:#A10115', 'fill:var(--bordeaux)')
s = re.sub(r"font-family:'[^']*'", 'font-family:var(--serif)', s)

# taille : on laisse la page decider, le viewBox suffit
s = re.sub(r'\s(?:width|height)="[\d.]+mm"', '', s, count=2)
s = re.sub(r'\sxml:space="preserve"', '', s)
s = re.sub(r'\n\s*\n+', '\n', s).strip()

open(sortie, 'w', encoding='utf8', newline='').write(s)
print('  %s : %d -> %d octets  (clipPath conserves : %d)' % (prefixe, avant, len(s), s.count('<clipPath')))
