// Tests du vérificateur de preuve : node tests/verifier.mjs
// Charge la logique de verificateur.html (bloc <script id="logique-verification">) : un seul code de vérification.
// Options : HORS_LIGNE=1 pour ne pas interroger les explorateurs Bitcoin.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, getHashes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ici = dirname(fileURLToPath(import.meta.url));
const racineOutil = join(ici, "..");
const HORS_LIGNE = process.env.HORS_LIGNE === "1";

/* ---------- Chargement de la logique ---------- */

const html = readFileSync(join(racineOutil, "verificateur.html"), "utf8");
const bloc = html.match(/<script id="logique-verification">([\s\S]*?)<\/script>/);
if (!bloc) throw new Error("bloc logique-verification introuvable");
const V = new Function(bloc[1] + "\nreturn VerifPreuve;")();
const LIGNE_VIDE = '<script type="application/json" id="dossier-preuve"></script>';

let reussis = 0, rates = 0;
function attendu(nom, condition, detail) {
  if (condition) { reussis++; console.log("  ok    " + nom); }
  else { rates++; console.log("  ÉCHEC " + nom + (detail ? " — " + detail : "")); }
}
const sha = (x) => createHash("sha256").update(x).digest("hex");
const copie = (o) => JSON.parse(JSON.stringify(o));

/* ---------- 0. Primitives ---------- */

console.log("0. Primitives");
attendu("la page contient une seule ligne de dossier vide", html.split(LIGNE_VIDE).length === 2);
for (const t of ["", "abc", "é".repeat(100), "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)]) {
  attendu("sha256 (" + t.length + " car.)", V.hex(V.sha256(t)) === sha(t));
  attendu("sha1 (" + t.length + " car.)", V.hex(V.sha1(t)) === createHash("sha1").update(t).digest("hex"));
}
const rmdVecteurs = { "": "9c1185a5c5e9fc54612808977ee8f548b2258d31", "abc": "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc",
  "message digest": "5d0689ef49d2fae572b881b123a85ffa21595f36",
  "12345678901234567890123456789012345678901234567890123456789012345678901234567890": "9b752e45573d4b39f4dbd3323cab82bf63326bfb" };
for (const [t, h] of Object.entries(rmdVecteurs)) attendu("ripemd160 vecteur (" + t.length + " car.)", V.hex(V.ripemd160(t)) === h);
if (getHashes().includes("ripemd160")) {
  for (const n of [1, 63, 64, 65, 200]) { const b = randomBytes(n); attendu("ripemd160 = node (" + n + " o.)", V.hex(V.ripemd160(b)) === createHash("ripemd160").update(b).digest("hex")); }
}

/* ---------- Outils de fabrication (côté test seulement) ---------- */

function arbre(feuilles) {
  const tri = [...feuilles].sort();
  const niveaux = [tri];
  while (niveaux.at(-1).length > 1) {
    const n = niveaux.at(-1), s = [];
    for (let i = 0; i < n.length; i += 2) s.push(sha(n[i] + (n[i + 1] ?? n[i])));
    niveaux.push(s);
  }
  const chemin = (f) => {
    let i = tri.indexOf(f); const c = [];
    for (let k = 0; k < niveaux.length - 1; k++) {
      const n = niveaux[k], j = i ^ 1, voisin = j < n.length ? n[j] : n[i];
      c.push({ cote: i % 2 === 0 ? "droite" : "gauche", empreinte: voisin });
      i >>= 1;
    }
    return c;
  };
  return { racine: niveaux.at(-1)[0], chemin };
}

const varuint = (n) => { const o = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; o.push(b); } while (n); return o; };
const varbytes = (b) => [...varuint(b.length), ...b];
const enOctets = (s) => [...Buffer.from(s, "utf8")];
const MAGIQUE = [...Buffer.from("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294", "hex")];
const pending = (uri) => [0x00, ...Buffer.from("83dfe30d2ef90c8e", "hex"), ...varbytes(varbytes(enOctets(uri)))];

// .ots fabriqué : append aléa, sha256, puis trois branches (deux calendriers, une attestation inconnue).
function otsEnAttente(racineHex) {
  return Buffer.from([
    ...MAGIQUE, 0x01, 0x08, ...Buffer.from(racineHex, "hex"),
    0xf0, ...varbytes([...randomBytes(16)]), 0x08,
    0xff, 0xf1, ...varbytes([1, 2, 3, 4]), 0xf0, ...varbytes([5, 6, 7, 8, 9]), 0x08, ...pending("https://calendrier-a.exemple.invalid"),
    0xff, 0x00, ...Buffer.from("0102030405060708", "hex"), ...varbytes([1, 2, 3]),
    0x02, 0x03, 0xf2, 0xf3, 0x08, ...pending("https://calendrier-b.exemple.invalid")
  ]);
}

/* ---------- a) Le vrai scellement ---------- */

const z = (v) => (v === null || v === undefined ? "" : v);
const triCles = (v) => Array.isArray(v) ? v.map(triCles) : (v && typeof v === "object") ? Object.keys(v).sort().reduce((o, k) => (o[k] = triCles(v[k]), o), {}) : v;

function canoniqueMoment(e) {
  if (e.hashVersion === 2) {
    return JSON.stringify([2, e.id, e.portfolioId, z(e.authorId), e.type, z(e.title), z(e.content), z(e.imageUrl), z(e.attachmentUrl),
      e.isSystemGenerated, z(e.sourceReference), e.date, e.createdAt, e.details ? JSON.stringify(triCles(e.details)) : "", e.prive, z(e.previousHash)]);
  }
  if (e.hashVersion === 1 || e.hashVersion == null) {
    return JSON.stringify([e.id, e.portfolioId, z(e.authorId), e.type, z(e.title), z(e.content), z(e.imageUrl), z(e.attachmentUrl),
      z(e.proofLevel), e.isSystemGenerated, z(e.sourceReference), e.date, e.createdAt, z(e.previousHash)]);
  }
  throw new Error("hashVersion inattendue " + e.hashVersion);
}
const canoniquePasseport = (p) => JSON.stringify(["passeport", 1, p.id, p.portfolioId, p.type, z(p.cible), JSON.stringify(triCles(p.contenu)), z(p.fileHash), p.sel, p.createdAt]);

// Un vrai scellement ancré dans Bitcoin (bloc 970397) : empreintes, chemins et fichier .ots seulement, aucun contenu.
function dossierReel() {
  return JSON.parse(readFileSync(join(ici, "scellement-bitcoin.json"), "utf8"));
}

/* ---------- b) Le dossier synthétique ---------- */

const papier = Buffer.from("%PDF-1.4\nFacture de révision, document de test.\n", "utf8");
const papierFaux = Buffer.from("%PDF-1.4\nFacture de révision, document de test!\n", "utf8");

function ligneParChamps(formule, valeurs, cacher) {
  const champs = {}, caches = {};
  for (const [nom, v] of Object.entries(valeurs)) {
    const valeur = JSON.stringify(v), sel = randomBytes(16).toString("hex");
    if (cacher.includes(nom)) caches[nom] = sha("champ:" + nom + ":" + sel + ":" + valeur);
    else champs[nom] = { valeur, sel };
  }
  const eng = { ...Object.fromEntries(Object.entries(champs).map(([n, c]) => [n, sha("champ:" + n + ":" + c.sel + ":" + c.valeur)])), ...caches };
  const paires = Object.keys(eng).sort().map((n) => n + "=" + eng[n]).join(";");
  const prefixe = formule === "moment-3" ? "moment:3:" : "passeport:2:";
  return { nature: formule.startsWith("moment") ? "moment" : "passeport", formule, empreinte: sha(prefixe + paires), sceau: "sceau-synthetique",
    chemin: [], heritee: false, champs, caches };
}

function dossierSynthetique() {
  const base = { id: "", portfolio: "pf-test", auteur: "auteur-test", type: "", titre: "", texte: "", image: "", justificatif: "",
    systeme: false, source: "", date: "", creeLe: "", details: null, prive: false, precedente: "" };
  const lignes = [
    ligneParChamps("moment-3", { ...base, id: "m1", type: "ACQUISITION", systeme: true, date: "2024-03-01T09:00:00.000Z", creeLe: "2024-03-01T09:00:00.000Z" }, ["auteur", "portfolio"]),
    ligneParChamps("moment-3", { ...base, id: "m2", type: "SERVICE", titre: "Révision complète", texte: "Révision chez l’horloger, étanchéité contrôlée.",
      date: "2025-06-12T10:00:00.000Z", creeLe: "2025-06-13T08:30:00.000Z",
      details: { fait: ["REVISION", "ETANCHEITE", "PIECE"], pieces: [{ nom: "Joints", origine: "ORIGINE" }], mesures: { marche: 2, etancheite: 5 }, atelier: { nom: "Atelier d’essai", ville: "Lyon" } } },
      ["auteur", "portfolio", "justificatif", "precedente"]),
    ligneParChamps("moment-3", { ...base, id: "m3", type: "NOTE", titre: "Note privée", texte: "Ce texte n’est pas montré.", date: "2025-07-01T10:00:00.000Z", creeLe: "2025-07-01T10:00:00.000Z" },
      ["auteur", "portfolio", "titre", "texte"]),
    ligneParChamps("passeport-2", { id: "p1", portfolio: "pf-test", type: "CREATION", cible: null, fichier: null, creeLe: "2024-03-01T09:00:00.000Z",
      "contenu.marque": "Omega", "contenu.modele": "Speedmaster", "contenu.reference": "310.30.42", "contenu.serie": sha("numéro de série") }, ["contenu.serie", "portfolio"]),
    ligneParChamps("passeport-2", { id: "p2", portfolio: "pf-test", type: "DOCUMENT_AJOUTE", cible: "doc-1", fichier: sha(papier), creeLe: "2025-06-13T08:31:00.000Z",
      "contenu.type": "FACTURE" }, ["portfolio"])
  ];
  const a = arbre(lignes.map((l) => l.empreinte));
  lignes.forEach((l) => { l.chemin = a.chemin(l.empreinte); });
  lignes[0].heritee = true;
  return {
    format: "coindesmontres.dossier-preuve", version: 1, genereLe: "2026-11-17T10:00:00.000Z", source: "lien",
    montre: { marque: "Omega", modele: "Speedmaster", reference: "310.30.42" }, enAttente: 1,
    sceaux: { "sceau-synthetique": { racine: a.racine, scelleLe: "2025-06-13T09:00:00.000Z", ots: otsEnAttente(a.racine).toString("base64") } },
    lignes
  };
}

/* ---------- Exécution ---------- */

const fetchMuet = () => Promise.reject(new Error("hors ligne"));
function fetchFaux(merkle) {
  return (url) => {
    const m = url.match(/\/block-height\/(\d+)$/);
    if (m) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("ab".repeat(32)) });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ id: "ab".repeat(32), height: 970397, merkle_root: merkle, timestamp: 1791500000 })) });
  };
}
async function verifier(dossier, recuperer) {
  const rap = V.verifierHorsLigne(dossier);
  if (!rap.erreur) await V.consulterBitcoin(rap, recuperer, { delai: 15000 });
  return { rap, v: V.verdict(rap) };
}

const reel = dossierReel();
const synth = dossierSynthetique();
writeFileSync(join(ici, "dossier-synthetique.json"), JSON.stringify(synth, null, 2) + "\n");
const embarquer = (d) => html.replace(LIGNE_VIDE, () => '<script type="application/json" id="dossier-preuve">' + JSON.stringify(d).replace(/</g, "\\u003c") + "</script>");
writeFileSync(join(ici, "dossier-reel.html"), embarquer(reel));
writeFileSync(join(ici, "dossier-synthetique.html"), embarquer(synth));

console.log("\na) Vrai scellement sceau-bitcoin (" + reel.lignes.length + " lignes)");
{
  const hl = V.verifierHorsLigne(copie(reel));
  attendu("toutes les lignes : chemin vérifié, contenu non divulgué", hl.lignes.every((r) => r.contenu.etat === "non-divulgue" && r.chemin.etat === "ok"));
  attendu("au moins une ligne héritée", reel.lignes.some((l) => l.heritee));
  const s = hl.sceaux["sceau-bitcoin"];
  attendu("fichier .ots lu, départ = racine", s.ots.etat === "ok", s.ots.message);
  const btc = s.attestations.filter((x) => x.type === "bitcoin");
  attendu("attestation Bitcoin au bloc 970397", btc.some((x) => x.hauteur === 970397));
  console.log("        attestations : " + s.attestations.map((x) => x.type + (x.hauteur ? " " + x.hauteur : "")).join(", "));
  console.log("        racine de Merkle attendue du bloc : " + (btc[0] && btc[0].racineAttendue));

  const faux = await verifier(copie(reel), fetchFaux("00".repeat(32)));
  attendu("explorateur simulé contradictoire → échec à l’étape bitcoin", faux.v.etat === "echec" && faux.v.etape === "bitcoin", JSON.stringify(faux.v));
  const muet = await verifier(copie(reel), fetchMuet);
  attendu("aucun explorateur → « vérifié jusqu’à la racine »", muet.v.etat === "injoignable", JSON.stringify(muet.v));
  const juste = await verifier(copie(reel), fetchFaux(btc[0].racineAttendue));
  attendu("explorateur simulé concordant → vérifié", juste.v.etat === "verifie", JSON.stringify(juste.v));

  if (HORS_LIGNE) console.log("  (HORS_LIGNE=1 : explorateurs réels non interrogés)");
  else {
    const vrai = await verifier(copie(reel), fetch);
    const a = vrai.rap.sceaux["sceau-bitcoin"].attestations.find((x) => x.type === "bitcoin");
    for (const src of a.sources) console.log("        " + src.nom + " : " + src.etat + (src.merkle ? " merkle_root " + src.merkle + ", heure " + new Date(src.horodatage * 1000).toISOString() : " (" + src.message + ")"));
    attendu("vérifié jusqu’à Bitcoin (explorateurs réels)", vrai.v.etat === "verifie", JSON.stringify(vrai.v));
    attendu("les deux explorateurs concordent", a.sources.filter((x) => x.etat === "accord").length === 2);
  }

  const truque = copie(reel); truque.lignes[1].canonique = "[\"texte inventé\"]";
  const p = V.verifierHorsLigne(truque);
  attendu("texte inventé sur une vraie empreinte → contenu en échec", p.lignes[1].contenu.etat === "echec");
}

console.log("\nb) Dossier synthétique, formules par champs, .ots en attente");
{
  const { rap, v } = await verifier(copie(synth), fetchMuet);
  attendu("verdict « en attente »", v.etat === "attente", JSON.stringify(v));
  attendu("toutes les lignes vérifiées jusqu’à la racine", rap.lignes.every((r) => r.contenu.etat === "ok" && r.chemin.etat === "ok"));
  const s = rap.sceaux["sceau-synthetique"];
  attendu("deux calendriers et une attestation inconnue lus", s.attestations.filter((a) => a.type === "attente").length === 2 && s.attestations.some((a) => a.type === "inconnue"));
  attendu("champs cachés repérés", rap.lignes[2].caches.titre === true && rap.lignes[2].valeurs.titre === undefined);
  attendu("détails d’entretien lus", rap.lignes[1].valeurs.details.atelier.ville === "Lyon");
  attendu("contenu.<clé> regroupé", rap.lignes[3].valeurs.contenu.marque === "Omega");
  const bon = V.chercherFichier(rap, new Uint8Array(papier));
  attendu("le bon papier correspond à la ligne 5", bon.lignes.length === 1 && bon.lignes[0] === 4);
}

console.log("\nc) Falsifications");
async function doitEchouer(nom, dossier, etape) {
  const { v } = await verifier(dossier, fetchMuet);
  attendu(nom + " → échec à l’étape " + etape, v.etat === "echec" && v.etape === etape, JSON.stringify(v));
}
{
  const d = copie(synth); const c = d.lignes[1].champs.titre; const v = JSON.parse(c.valeur);
  c.valeur = JSON.stringify(v.slice(0, 3) + (v[3] === "x" ? "y" : "x") + v.slice(4));
  await doitEchouer("un caractère changé dans un titre", d, "contenu");
}
{
  const d = copie(synth); const c = d.lignes[1].champs.titre; c.sel = (c.sel[0] === "0" ? "1" : "0") + c.sel.slice(1);
  await doitEchouer("un sel changé", d, "contenu");
}
{
  const d = copie(reel); const e = d.lignes[3].chemin[2]; e.cote = e.cote === "droite" ? "gauche" : "droite";
  await doitEchouer("une étape de chemin inversée", d, "chemin");
}
{
  const d = copie(reel); const s = d.sceaux["sceau-bitcoin"]; s.racine = s.racine.slice(0, -1) + (s.racine.endsWith("0") ? "1" : "0");
  await doitEchouer("une racine changée", d, "chemin");
}
{
  const d = copie(reel); d.sceaux["sceau-bitcoin"].ots = synth.sceaux["sceau-synthetique"].ots;
  await doitEchouer("un .ots d’un autre scellement", d, "horodatage");
}
{
  const d = copie(synth); const l = d.lignes[2];
  delete l.caches.texte; l.champs.texte = { valeur: JSON.stringify("Un texte inventé"), sel: randomBytes(16).toString("hex") };
  await doitEchouer("un champ caché devenu montré avec une fausse valeur", d, "contenu");
}
{
  const rap = V.verifierHorsLigne(copie(synth));
  const r = V.chercherFichier(rap, new Uint8Array(papierFaux));
  attendu("un fichier de papier différent → aucune ligne", r.lignes.length === 0);
}
{
  const d = copie(reel); const o = Buffer.from(d.sceaux["sceau-bitcoin"].ots, "base64"); d.sceaux["sceau-bitcoin"].ots = o.subarray(0, o.length - 3).toString("base64");
  await doitEchouer("un .ots tronqué", d, "horodatage");
}
{
  const d = copie(synth); d.lignes[0].champs.type = { valeur: JSON.stringify("SERVICE"), sel: d.lignes[0].champs.type.sel };
  await doitEchouer("un type de moment changé", d, "contenu");
}
{
  const r = V.verifierHorsLigne({ format: "autre", version: 1, sceaux: {}, lignes: [] });
  attendu("un fichier qui n’est pas un dossier → échec à l’étape dossier", V.verdict(r).etape === "dossier");
}
{
  // Profondeur bornée : 300 opérations sha256 imbriquées.
  const profond = Buffer.from([...MAGIQUE, 0x01, 0x08, ...Buffer.alloc(32), ...Array(300).fill(0x08), ...pending("https://a.invalid")]);
  let msg = ""; try { V.analyserOts(new Uint8Array(profond)); } catch (e) { msg = e.message; }
  attendu("arbre .ots trop profond refusé", /profond/.test(msg), msg);
}

console.log("\n" + reussis + " réussis, " + rates + " ratés.");
console.log("Écrits : tests/dossier-synthetique.json, tests/dossier-reel.html, tests/dossier-synthetique.html.");
process.exit(rates ? 1 : 0);
