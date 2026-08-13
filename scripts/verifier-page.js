#!/usr/bin/env node
/*
 * Vérifie une page d'exercice, et la confronte au document Word dont elle est
 * tirée.
 *
 * Trois contrôles :
 *
 *   1. rendu — chaque formule de la page passe-t-elle dans KaTeX ? Une formule
 *      fautive s'affiche en rouge sur le site sans autre avertissement ;
 *   2. convention — aucune ligne d'un bloc aligné ne doit commencer par « &= »
 *      seul : la grandeur calculée est répétée à chaque ligne ;
 *   3. confrontation — si on fournit les formules du document (produites par
 *      scripts/docx-formules.py --json), chaque membre d'égalité de la page est
 *      comparé à ceux du document.
 *
 * La comparaison ne porte pas sur le texte LaTeX, qui diffère légitimement d'un
 * côté à l'autre (\dfrac contre \frac, {{R}_{o}} de MathType contre R_o). On
 * rend chaque membre en MathML par KaTeX et on compare la suite des symboles et
 * des structures — fractions, exposants, indices, racines. Les espaces, les
 * marques de multiplication et les caractères invisibles sont ignorés : ils ne
 * portent pas de sens mathématique.
 *
 * Un écart signalé n'est pas forcément une erreur : un pas de calcul volontai-
 * rement omis, une parenthèse de clarté ou une notation harmonisée en produisent
 * aussi. Le script montre où les deux signatures divergent ; la lecture reste à
 * faire.
 *
 * Usage :
 *   node scripts/verifier-page.js <page.html>
 *   node scripts/verifier-page.js <page.html> <formules.json>
 *
 * Dépendance : KaTeX. Depuis la racine du dépôt : npm install katex
 */

const fs = require('fs');

let katex;
try {
  katex = require('katex');
} catch (e) {
  console.error('KaTeX est introuvable. Depuis la racine du dépôt :\n\n    npm install katex\n');
  process.exit(2);
}

/* ─────────────────────────── découpage ─────────────────────────── */

/* Suit les accolades et les \left … \right pour ne couper qu'au niveau 0 : le
   « = » de R(T_1 = 300 K) ne sépare pas deux membres. */
function profondeurs(s) {
  const d = [];
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      if (s.startsWith('\\left', i)) { n++; i += 4; continue; }
      if (s.startsWith('\\right', i)) { n--; i += 5; continue; }
      i++;
      continue;
    }
    if (s[i] === '{') n++;
    else if (s[i] === '}') n--;
    d[i] = n;
  }
  return d;
}

function membres(tex) {
  const t = tex.replace(
    /\\(begin|end)\{(align\*?|aligned|gather\*?|gathered|cases|array)\}(\{[^}]*\})?/g, '');
  const sortie = [];
  for (let ligne of t.split(/\\\\/)) {
    ligne = ligne.replace(/\[[.0-9]*em\]/g, '').replace(/&/g, ' ').trim();
    ligne = ligne.replace(/\\left\(\s*\d+\s*\\right\)\s*$/, '').trim();  // numéro collé
    if (!ligne || /^\(\s*\d+\s*\)$/.test(ligne)) continue;
    const d = profondeurs(ligne);
    let debut = 0;
    for (let i = 0; i < ligne.length; i++) {
      if (ligne[i] === '=' && (d[i] || 0) === 0 && ligne[i - 1] !== '\\') {
        sortie.push(ligne.slice(debut, i));
        debut = i + 1;
      }
    }
    sortie.push(ligne.slice(debut));
  }
  return sortie.map(m => m.trim()).filter(Boolean);
}

/* ─────────────────────────── signature ─────────────────────────── */

/* Espaces de toutes largeurs, marques de direction, application de fonction,
   separateurs invisibles. On les reconnait par leur code plutot que par une
   expression rationnelle : plusieurs d'entre eux - U+2028 en tete - casseraient
   ce fichier source s'ils y figuraient en clair. */
function invisible(code) {
  return code <= 0x20                          // espace, tabulation, retours
    || code === 0xA0 || code === 0x1680        // insecable, ogham
    || code === 0x3000 || code === 0xFEFF      // cadratin CJC, chasse nulle
    || (code >= 0x2000 && code <= 0x200F)      // espaces typographiques, liaisons
    || (code >= 0x2028 && code <= 0x202F)      // separateurs, marques de sens
    || (code >= 0x205F && code <= 0x206F);     // espace mathematique, invisibles
}

function nettoyer(texte) {
  let sortie = '';
  for (const caractere of texte) {
    const code = caractere.codePointAt(0);
    if (invisible(code)) continue;
    sortie += code === 0x2212 ? '-' : caractere;   // moins mathematique
  }
  return sortie;
}

const MULTIPLICATION = /[×⋅*.]/g;   // releve du style, pas du contenu
const STRUCTURE = new Set(['mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot']);

function signature(tex) {
  let ml;
  try {
    ml = katex.renderToString(tex, { output: 'mathml', throwOnError: true, displayMode: true });
  } catch (e) {
    return null;
  }
  const jetons = [];
  const re = /<(m[a-z]+)[^>]*>([^<]*)/g;
  let m;
  while ((m = re.exec(ml)) !== null) {
    const balise = m[1];
    if (balise === 'math') continue;
    if (STRUCTURE.has(balise)) jetons.push('<' + balise + '>');
    const contenu = nettoyer(m[2] || '');
    if (contenu) jetons.push(contenu);
  }
  // 8,0.10³ du document et 8,0 × 10³ de la page doivent se confondre
  return jetons.join('').replace(MULTIPLICATION, '');
}

/* ─────────────────────────── page ─────────────────────────── */

const cheminPage = process.argv[2];
if (!cheminPage) {
  console.error('Usage : node scripts/verifier-page.js <page.html> [formules.json]');
  process.exit(2);
}

let html = fs.readFileSync(cheminPage, 'utf8');
const debutCorps = html.indexOf('<body>');
if (debutCorps !== -1) html = html.slice(debutCorps);
const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, '');
const texte = sansCommentaires.replace(/<[^>]+>/g, '');

const formulesPage = [];
const reMath = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
let m;
while ((m = reMath.exec(texte)) !== null) {
  formulesPage.push({ display: m[1] !== undefined, tex: m[1] !== undefined ? m[1] : m[2] });
}

let echecs = 0;
for (const f of formulesPage) {
  try {
    katex.renderToString(f.tex, { displayMode: f.display, throwOnError: true });
  } catch (e) {
    echecs++;
    console.log('RENDU  ' + e.message.split('\n')[0]);
    console.log('       ' + f.tex.replace(/\s+/g, ' ').slice(0, 120));
  }
}
console.log('1. Rendu         : %d formules, %d en échec', formulesPage.length, echecs);

const orphelines = sansCommentaires
  .split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /^\s*&=/.test(l));
orphelines.forEach(([n, l]) => console.log('CONVENTION  ligne %d : %s', n, l.trim().slice(0, 80)));
console.log('2. Convention    : %d ligne(s) de continuation sans la grandeur', orphelines.length);

/* ─────────────────────────── confrontation ─────────────────────────── */

const cheminSource = process.argv[3];
if (!cheminSource) {
  console.log('3. Confrontation : ignorée, aucun fichier de formules fourni');
  process.exit(echecs || orphelines.length ? 1 : 0);
}

function indexer(liste) {
  const index = new Map();
  for (const f of liste) {
    for (const membre of membres(f.tex)) {
      const s = signature(membre);
      if (s && !index.has(s)) index.set(s, membre);
    }
  }
  return index;
}

const source = indexer(JSON.parse(fs.readFileSync(cheminSource, 'utf8')));
const page = indexer(formulesPage);

function prefixe(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const manquants = [...source.keys()].filter(s => !page.has(s));
console.log('3. Confrontation : %d membres au document, %d retrouvés dans la page, %d à examiner',
  source.size, source.size - manquants.length, manquants.length);

let n = 0;
for (const s of manquants) {
  n++;
  let proche = null, score = -1;
  for (const [s2, t2] of page) {
    const p = prefixe(s, s2);
    if (p > score) { score = p; proche = [s2, t2]; }
  }
  console.log('\n── écart %d ──', n);
  console.log('  DOCUMENT : ' + source.get(s).replace(/\s+/g, ' ').slice(0, 180));
  if (proche) {
    console.log('  PAGE     : ' + proche[1].replace(/\s+/g, ' ').slice(0, 180));
    const debut = Math.max(0, score - 12);
    console.log('  document : …' + s.slice(debut, score + 28));
    console.log('  page     : …' + proche[0].slice(debut, score + 28));
    console.log('             ' + ' '.repeat(Math.min(score, 12) + 1) + '^ divergence');
  }
}

process.exit(echecs || orphelines.length ? 1 : 0);
