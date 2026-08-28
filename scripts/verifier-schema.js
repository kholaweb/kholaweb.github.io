#!/usr/bin/env node
/*
 * Règle la taille d'un schéma sur la hauteur des capitales du texte, et
 * contrôle ce qui, dans un SVG, ne se voit qu'une fois la page publiée.
 *
 * La convention du site veut que les libellés d'un schéma aient la hauteur de
 * capitale du texte courant — 11 px pour un corps de 15. Trois raisons de ne pas
 * régler cela à l'œil :
 *
 *   · les exports CorelDRAW n'ont pas tous la même échelle interne. Le même
 *     trait vaut 14,02 unités sur un dessin et 26,61 sur un autre : une largeur
 *     unique ne donne pas des libellés comparables d'une page à l'autre ;
 *   · getBBox() ne mesure pas la même chose selon le dessin. Sur un <text> il
 *     renvoie la boîte de la fonte, ascendante et descendante comprises ; sur un
 *     libellé vectorisé, l'encre. Un dessin aux libellés en <text> et un dessin
 *     vectorisé ne sont donc pas comparables par ce biais ;
 *   · lire les pixels d'un rendu d'ensemble ne vaut pas mieux : un point de nœud
 *     ou un trait qui passe dans la boîte d'un libellé gonfle la mesure.
 *
 * On rend donc chaque glyphe seul, dans un SVG qui ne contient que lui, et l'on
 * y lit la hauteur d'encre. La mesure ne dépend plus ni de la façon dont le
 * libellé est fait, ni de ce qui l'entoure.
 *
 * Deux emplois :
 *
 *   node scripts/verifier-schema.js <page.html>
 *       mesure les schémas de la page tels qu'ils s'affichent, et donne pour
 *       chacun la largeur qui mettrait ses capitales à la hauteur du texte ;
 *
 *   node scripts/verifier-schema.js <dessin.svg> [largeur-px]
 *       même mesure sur un fichier seul, avant de l'insérer dans une page.
 *       La largeur d'essai vaut 256 px par défaut.
 *
 * Le script signale en outre deux défauts qui ne se voient pas à la lecture :
 * un second attribut style sur <svg>, que l'analyseur HTML jette en silence, et
 * les couleurs fixes qui ne suivraient pas le mode sombre.
 *
 * puppeteer-core n'est pas une dépendance du dépôt. L'installer dans un
 * répertoire de travail hors du dépôt et pointer NODE_PATH dessus.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error(
    'puppeteer-core est introuvable.\n' +
    'Installer dans un répertoire de travail hors du dépôt :\n' +
    '  npm install puppeteer-core\n' +
    'puis relancer avec NODE_PATH pointant dessus.');
  process.exit(2);
}

const CHROME = process.env.CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const cible = process.argv[2];
if (!cible) {
  console.error(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(1);
}
const largeurEssai = parseFloat(process.argv[3] || '256');

/* ── ce qui se lit dans le fichier, sans navigateur ────────────────────── */

function controlerTexte(fichier) {
  const s = fs.readFileSync(fichier, 'utf8');
  const ennuis = [];

  // Un <svg> CorelDRAW porte déjà un attribut style. En ajouter un second ne
  // lève aucune erreur : l'analyseur garde le premier et jette l'autre.
  for (const m of s.matchAll(/<svg\b[^>]*>/g)) {
    const styles = [...m[0].matchAll(/\sstyle="([^"]*)"/g)].map(x => x[1]);
    if (styles.length > 1) {
      const ligne = s.slice(0, m.index).split('\n').length;
      ennuis.push('ligne ' + ligne + ' : ' + styles.length
        + ' attributs style sur <svg>, seul le premier est retenu'
        + '\n      retenu : ' + styles[0]
        + '\n      jeté   : ' + styles.slice(1).join(' | '));
    }
  }

  // une couleur fixe ne suit pas le mode sombre ; elle ne se voit qu'en sombre
  const couleurs = new Set();
  for (const m of s.matchAll(/(?:fill|stroke):(#[0-9A-Fa-f]{3,8})/g)) {
    couleurs.add(m[1]);
  }
  if (couleurs.size) {
    ennuis.push('couleurs fixes, qui ne suivront pas le mode sombre : '
      + [...couleurs].join(', '));
  }
  return ennuis;
}

/* ── mesure dans le navigateur ─────────────────────────────────────────── */

/* Exécuté dans la page. Rend chaque glyphe seul et lit sa hauteur d'encre. */
async function mesurerFigure(svg, largeurAffichee) {
  const vb = svg.viewBox.baseVal;
  const PROPRIETES = ['font-family', 'font-size', 'font-style', 'font-weight',
                      'fill', 'stroke', 'stroke-width', 'fill-opacity',
                      'fill-rule', 'clip-rule'];

  // candidats : ce qui est trop petit pour être un trait du circuit
  const candidats = [];
  for (const el of svg.querySelectorAll('path,text,tspan')) {
    let b;
    try { b = el.getBBox(); } catch (e) { continue; }
    if (!b.width || !b.height) continue;
    if (b.height / vb.height > 0.16 || b.width / vb.width > 0.16) continue;
    candidats.push(el);
  }

  const ECHELLE = 16;            // rendu large : la mesure ne bute pas sur le pixel
  const parUnite = largeurAffichee / vb.width;
  const mesures = [];

  for (const el of candidats) {
    const b = el.getBBox();
    // un SVG qui ne contient que ce glyphe, cadré sur lui
    const seul = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    seul.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const marge = Math.max(b.width, b.height) * 0.25;
    seul.setAttribute('viewBox',
      (b.x - marge) + ' ' + (b.y - marge) + ' '
      + (b.width + 2 * marge) + ' ' + (b.height + 2 * marge));
    const largeurRendu = Math.max(8, Math.round((b.width + 2 * marge) * parUnite * ECHELLE));
    const hauteurRendu = Math.max(8, Math.round((b.height + 2 * marge) * parUnite * ECHELLE));
    seul.setAttribute('width', largeurRendu);
    seul.setAttribute('height', hauteurRendu);

    const copie = el.cloneNode(true);
    // les styles viennent parfois de la feuille de la page (.schema text) :
    // hors du document ils seraient perdus, on les reporte
    const cs = getComputedStyle(el);
    let dec = '';
    for (const prop of PROPRIETES) {
      const v = cs.getPropertyValue(prop);
      if (v) dec += prop + ':' + v + ';';
    }
    copie.setAttribute('style', dec.replace(/currentColor/g, '#000'));
    seul.appendChild(copie);

    const source = new XMLSerializer().serializeToString(seul);
    const image = new Image();
    try {
      await new Promise((ok, ko) => {
        image.onload = ok; image.onerror = ko;
        image.src = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(source);
      });
    } catch (e) { continue; }

    const c = document.createElement('canvas');
    c.width = largeurRendu; c.height = hauteurRendu;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(image, 0, 0, c.width, c.height);

    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let haut = -1, bas = -1;
    for (let y = 0; y < c.height; y++) {
      let encre = false;
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] < 160 || d[i + 1] < 160 || d[i + 2] < 160) { encre = true; break; }
      }
      if (encre) { if (haut < 0) haut = y; bas = y; }
    }
    if (haut < 0) continue;

    mesures.push({
      texte: el.tagName === 'path' ? '' : el.textContent.trim().slice(0, 8),
      hPx: +((bas - haut + 1) / ECHELLE).toFixed(2),
      fontSize: cs.getPropertyValue('font-size'),
    });
  }
  return { largeurAffichee, vbW: vb.width, mesures };
}

/* ── regroupement et recommandation ────────────────────────────────────── */

function familles(mesures) {
  // regroupe les glyphes de même hauteur à 4 % près
  const groupes = [];
  for (const m of [...mesures].sort((a, b) => b.hPx - a.hPx)) {
    const g = groupes.find(g => Math.abs(g.h - m.hPx) / g.h < 0.04);
    if (g) { g.n++; g.membres.push(m); g.h = (g.h * (g.n - 1) + m.hPx) / g.n; }
    else groupes.push({ h: m.hPx, n: 1, membres: [m] });
  }
  return groupes;
}

function rapporter(nom, resultat, capitaleTexte) {
  console.log('\n  · %s — affiché sur %s px', nom, resultat.largeurAffichee);
  if (!resultat.mesures.length) {
    console.log('      aucun libellé mesurable');
    return;
  }
  const groupes = familles(resultat.mesures);

  // La capitale de référence est celle de la famille la plus nombreuse : dans un
  // schéma de circuit, ce sont les libellés courants (R, A, B, I). Les grandeurs
  // que l'auteur a voulues plus grandes forment une famille à part, moins
  // nombreuse, et ne doivent pas servir d'étalon.
  const dominante = [...groupes].sort((a, b) => b.n - a.n || b.h - a.h)[0];

  for (const g of groupes) {
    const noms = g.membres.map(m => m.texte).filter(Boolean);
    const ecart = capitaleTexte ? ((g.h / capitaleTexte - 1) * 100).toFixed(0) : null;
    console.log('      %s px  ×%d %s%s%s',
      String(g.h.toFixed(2)).padStart(6), g.n,
      noms.length ? '« ' + noms.join(' ') + ' »' : '(vectorisés)',
      ecart !== null ? '   ' + (ecart > 0 ? '+' : '') + ecart + '% du texte' : '',
      g === dominante ? '   ← référence' : '');
  }

  if (capitaleTexte) {
    const vise = resultat.largeurAffichee * capitaleTexte / dominante.h;
    const ecart = ((dominante.h / capitaleTexte - 1) * 100).toFixed(0);
    console.log('      capitale du texte : %s px', capitaleTexte);
    if (Math.abs(dominante.h - capitaleTexte) / capitaleTexte > 0.10) {
      console.log('      ⚠ écart de %s%% — largeur qui égaliserait : %s px, soit %s rem',
        (ecart > 0 ? '+' : '') + ecart,
        vise.toFixed(0), (vise / 16).toFixed(1));
    } else {
      console.log('      écart de %s%% — accordé', (ecart > 0 ? '+' : '') + ecart);
    }
  }
}

/* ── programme ─────────────────────────────────────────────────────────── */

(async () => {
  const ennuis = controlerTexte(cible);

  const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await navigateur.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });

  console.log('\n═══ %s', path.basename(cible));

  if (/\.html?$/i.test(cible)) {
    await page.goto('file:///' + path.resolve(cible).replace(/\\/g, '/'),
      { waitUntil: 'networkidle0' });
    // les schémas du corrigé ne se mesurent que celui-ci déplié
    await page.evaluate(() => {
      for (const d of document.querySelectorAll('details')) d.open = true;
    });

    const capitaleTexte = await page.evaluate(() => {
      const p = [...document.querySelectorAll('.partie p')]
        .find(e => !e.classList.contains('titre-partie')
                && !e.classList.contains('ligne-formule'));
      if (!p) return null;
      const st = getComputedStyle(p);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
      return +ctx.measureText('H').actualBoundingBoxAscent.toFixed(2);
    });

    const nombre = await page.evaluate(() =>
      document.querySelectorAll('figure.schema svg').length);

    for (let i = 0; i < nombre; i++) {
      const r = await page.evaluate(async (i, fn) => {
        const mesurer = new Function('return ' + fn)();
        const fig = document.querySelectorAll('figure.schema')[i];
        const svg = fig.querySelector('svg');
        const largeur = svg.getBoundingClientRect().width;
        const r = await mesurer(svg, largeur);
        r.classe = fig.className;
        return r;
      }, i, mesurerFigure.toString());
      rapporter('figure « ' + r.classe + ' »', r, capitaleTexte);
    }
  } else {
    const svg = fs.readFileSync(cible, 'utf8');
    await page.setContent('<!doctype html><body style="margin:0;color:#000">'
      + svg + '</body>');
    const r = await page.evaluate(async (largeur, fn) => {
      const mesurer = new Function('return ' + fn)();
      const svg = document.querySelector('svg');
      svg.removeAttribute('width'); svg.removeAttribute('height');
      return await mesurer(svg, largeur);
    }, largeurEssai, mesurerFigure.toString());
    rapporter('dessin seul', r, 11);
  }

  if (ennuis.length) {
    console.log('\n  ⚠ à reprendre dans le fichier :');
    for (const e of ennuis) console.log('    · ' + e);
  }

  console.log('');
  await navigateur.close();
})();
