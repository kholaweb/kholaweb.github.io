/*
 * Sert KaTeX depuis une copie locale aux pages ouvertes par puppeteer.
 *
 * Les pages chargent KaTeX depuis cdn.jsdelivr.net. Là où ce domaine est
 * inaccessible — un environnement au réseau filtré —, les formules restent en
 * LaTeX brut, plus large que le rendu : les contrôles de mise en page signalent
 * alors des débordements qui n'existent pas sur le site.
 *
 * Si la variable KATEX_LOCAL désigne un paquet katex installé (le répertoire qui
 * contient dist/), chaque requête https://cdn.jsdelivr.net/npm/katex@<v>/dist/…
 * est servie depuis <KATEX_LOCAL>/dist/…, polices comprises. Sans KATEX_LOCAL,
 * rien ne change : la page charge le CDN comme sur le site.
 *
 * La version demandée par la page est comparée à celle de la copie ; un écart
 * est signalé, le rendu pouvant en dépendre.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MOTIF = /^https:\/\/cdn\.jsdelivr\.net\/npm\/katex@([^/]+)\/dist\/([^?#]+)/;
const TYPES = {
  '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf',
};

let ecartSignale = false;

async function servirKatexLocal(onglet) {
  const racine = process.env.KATEX_LOCAL;
  if (!racine) return;
  const version = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8')).version;

  await onglet.setRequestInterception(true);
  onglet.on('request', requete => {
    const m = MOTIF.exec(requete.url());
    if (!m) return requete.continue();
    if (m[1] !== version && !ecartSignale) {
      ecartSignale = true;
      console.error(`KaTeX : la page demande ${m[1]}, la copie locale est en ${version}.`);
    }
    const fichier = path.join(racine, 'dist', m[2]);
    if (!fs.existsSync(fichier)) {
      console.error(`KaTeX : ${fichier} introuvable dans la copie locale.`);
      return requete.respond({ status: 404, body: '' });
    }
    requete.respond({
      status: 200,
      // une police d'une autre origine que la page n'est acceptée qu'avec CORS
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: TYPES[path.extname(fichier)] || 'application/octet-stream',
      body: fs.readFileSync(fichier),
    });
  });
}

module.exports = { servirKatexLocal };
