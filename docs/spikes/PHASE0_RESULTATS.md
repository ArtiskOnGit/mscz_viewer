# Phase 0 — Résultats des spikes (2026-11-25)

Code des spikes : [`spikes/`](../../spikes/README.md). Les partitions de test sont dans `test-scores/`, qui n'est pas versionné.

## Corpus testé

| Fichier | Version MuseScore | Contenu notable |
|---|---|---|
| `Meme_Compilation_-_Alto_Sax._Solo_V7.0_.mscz` | **2.1.0** (format 2.06) | 1 partie, 322 mesures, **9 reprises + 2 voltas**, 32 changements de tempo, 24 changements d'armure, textes longs |
| `onlyfuhnbrass_-_medley_Russ.mscz` | **4.5.2** (format 4.50) | 5 parties (2 sax ténor, 2 sousaphones, batterie), 143 mesures, 10 changements de métrique |
| `unity_transpos_.mscz` | **4.6.2** (format 4.60) | 4 parties (trompette Sib, sax ténor, sousaphone, batterie), 132 mesures, swing |
| `Toccata_v2.mscz` | **3.6.2** (format 3.02) | 7 parties (fanfare), 122 mesures, **63 reprises**, 56 changements de tempo, 58 repères (A, B…), parties séparées définies dans le fichier |

👉 Le corpus couvre MuseScore **2.1, 3.6, 4.5 et 4.6** : les 4 fichiers se chargent.

## Synthèse

| Spike | Verdict | Résumé |
|---|---|---|
| **S1 — webmscore** | ✅ **Validé** (avec précautions) | Les 3 fichiers (2.1, 4.5, 4.6) se chargent. MusicXML, métadonnées et positions des mesures sont exportés correctement. Fonctionne dans Node et dans Chromium. |
| **S2 — Verovio** | ✅ **Validé** | Rendu propre, mise en page adaptée à l'écran, rapide. |
| **S3 — Timeline** | ✅ **Validé** | Ordre de jeu de MuseScore (reprises dépliées) = ordre de Verovio. Écart de temps nul sur les fichiers 4.x. Le filtrage des parties doit **conserver les tempos** (prototype fait). |
| **S4 — Transposition** | ✅ **Validé** | `transpose` (`+3`, `m3`, `Eb`) et `transposeToSoundingPitch` fonctionnent. |
| **S5 — Pédalier** | ⏭️ **Reporté en phase 1** | Touches clavier OK dans le navigateur. Le test sur téléphone n'a pas pu se faire (voir « Test sur téléphone » ci-dessous). Il sera fait dans l'application Capacitor. |
| **S6 — Métronome** | ⏭️ **Reporté en phase 1** | Ordonnanceur Web Audio OK dans Chromium (0 clic en retard). Régularité et latence à vérifier sur Android, dans l'application. |

**Décision proposée** : confirmer l'architecture **webmscore (import) + Verovio (rendu)** (ADR-001, ADR-002, ADR-008).

---

## S1 — webmscore 1.2.1 (MuseScore 4.0 en WASM)

### Résultats (Node 24, PC)

| Étape | Meme (2.1) | Medley (4.5.2) | Unity (4.6.2) |
|---|---|---|---|
| `load` | 771 ms | 817 ms | 772 ms |
| `saveXml` | 168 ms | 234 ms | 199 ms |
| `savePositions(false)` (mesures) | 7 ms ✅ | 3 ms ✅ | 3 ms ✅ |
| `savePositions(true)` (segments) | ❌ plantage | ❌ | ❌ |
| `saveSvg`, `savePng`, `saveMidi` | ✅ | ✅ | ✅ |
| Mémoire en plus (RSS) | ~128 Mo | ~128 Mo | ~126 Mo |

Dans Chromium (émulation Pixel 7, CPU de PC), `load` prend environ 1,4 s, init comprise. **Il faudra mesurer sur un vrai téléphone** (probablement 3 à 5 fois plus lent).

### Constats

1. **Compatibilité des versions** : MuseScore 2.1, 4.5.2 et 4.6.2 sont lus. Le moteur 4.0 émet des avertissements « unknown tag » sur le fichier 4.5 (éléments qu'il ne connaît pas, ignorés), sans conséquence visible sur les notes.
2. **Plantage de `savePositions(true)`** (positions des segments) : erreur WASM « null function or function signature mismatch », **systématique**. Pire, **l'instance devient inutilisable** : le fichier suivant échoue au chargement.
   → **Règle pour l'application** : n'utiliser que `savePositions(false)`, **un worker neuf par import**, et le recréer après toute erreur.
3. **Positions des mesures = timeline idéale** : `events` contient la liste des mesures **dans l'ordre de jeu** (reprises et voltas dépliées : 389 événements pour 322 mesures sur le fichier 2.1), avec le temps en ms. `elements` donne la page et la position de chaque mesure dans la mise en page MuseScore (inutile pour nous).
4. **Métadonnées** utiles : titre, version, nombre de mesures, durée, tempo, parties (`name`, `instrumentId`, programme MIDI). `excerpts` est vide pour ces fichiers (aucune partie séparée définie) : ce n'est pas gênant, puisqu'on filtre nous-mêmes.
5. **Projet non maintenu** : sous Node ≥ 21, il faut deux contournements (`navigator` en lecture seule, `fetch` utilisé avec un chemin local). Dans le navigateur, aucun contournement n'est nécessaire.
6. **Taille réelle** : `webmscore.lib.wasm` 9,2 Mo + `.mem.wasm` 4,2 Mo + `.data` 4,1 Mo + JS = **~18 Mo**. C'est plus que les 11 Mo annoncés dans le changelog.
7. Ce que la doc ne dit pas : le paquet charge ses fichiers `.wasm`/`.data` **à côté de la page HTML**. Dans Capacitor, il faudra les placer à la racine des assets web.
8. Un double tempo et un double « Swing » apparaissent sur Unity : **ils sont dans le fichier** (la miniature de MuseScore 4.6 les montre aussi). Ce n'est pas un bug.

## S2 — Verovio 6.4.1 sur le MusicXML exporté

### Résultats (Node, PC, page 1080×2200 px)

| Partition | Pages (écran tél.) | `loadData` | 1ʳᵉ page SVG | Relayout zoom ×1,25 |
|---|---|---|---|---|
| Unity, 4 parties | 4 (au lieu de 13 pages A4) | 422 ms | 76 ms | 160 ms |
| Unity, sax ténor seul | 2 | 163 ms | 70 ms | 52 ms |
| Meme (2.1), 1 partie | 5 | 354 ms | 48 ms | 141 ms |
| Medley, 5 parties | 4 | 505 ms | 79 ms | 217 ms |

Dans Chromium (émulation téléphone) : `loadData` 30–300 ms, page tournée **2–4 ms si pré-rendue**, 6–9 ms sinon, relayout 64–171 ms.

### Constats

1. **Qualité de rendu bonne** sur tout le corpus : notes, liaisons, nuances, soufflets, articulations, batterie (têtes en croix, 2 voix), changements d'armure, reprises, voltas et numéros de mesure. **Non vérifié** : le regroupement des silences multi-mesures en vue partie (aucun cas dans le corpus rendu).
2. **Mise en page adaptée** : `breaks: 'auto'` + `pageWidth/pageHeight` calculés depuis l'écran donnent la réorganisation attendue. Le zoom relance un relayout rapide.
3. **Conducteur sur téléphone en portrait** : à 100 % (scale 45), une partition de 4 instruments ne tient qu'à **1 mesure par écran**, à cause des noms d'instruments et de la hauteur des 4 portées. → Pour un conducteur, il faut un **zoom par défaut plus petit**, calculé selon le nombre de portées, et une option **masquer les noms d'instruments** (surtout en vue d'une seule partie, où le nom est répété à chaque système).
4. **Textes longs** (titres de section dans les tempos) : ils débordent à droite de la page sans retour à la ligne. Défaut mineur, à surveiller.
5. Les **polices SMuFL** (Leipzig) sont **intégrées dans chaque SVG** via `@font-face` (~58 Ko sur ~460 Ko par page). Elles s'affichent dans le navigateur. L'outil de conversion PNG des spikes (resvg) ne les lit pas, d'où l'absence du symbole de noire dans les images Node. Optimisation possible : charger la police une seule fois en CSS.
6. Taille du bundle Verovio (WASM intégré au JS) : **8,4 Mo** (2,5 Mo gzip).

## S3 — Timeline et correspondance des mesures

| Partition | Événements MuseScore | Événements Verovio | Ordre identique | Écart max |
|---|---|---|---|---|
| Meme (2.1, reprises) | 389 | 389 | ✅ (après normalisation des id) | 3,4 s sur 12,5 min |
| Medley (4.5.2) | 143 | 143 | ✅ | 1 ms |
| Unity (4.6.2) | 132 | 132 | ✅ | 0 ms |

### Constats

1. **Verovio déplie aussi les reprises** dans sa timemap. Il donne aux mesures répétées des identifiants suffixés `-rend2`, `-rend3`… Il suffit de retirer ce suffixe pour retrouver la mesure d'origine.
2. Le **rang de la mesure** dans le document (0-based) est une clé fiable entre webmscore (`elid`) et Verovio (ordre des `<measure>` dans le MEI).
3. L'écart de 3,4 s sur le fichier 2.1 vient de petites différences d'interprétation des 32 changements de tempo. **La timeline MuseScore reste la référence** pour les `.mscz`. Celle de Verovio suffit pour les imports MusicXML.
4. ⚠️ **Découverte importante** : MuseScore n'exporte les **indications de tempo** (`<sound tempo>`, `<metronome>`) **que dans la première partie** du MusicXML. Si on retire cette partie, Verovio perd les tempos (affichage et timemap, qui retombe à 120 BPM).
   → **Prototype réalisé** ([`spikes/shared/filter-parts.mjs`](../../spikes/shared/filter-parts.mjs)) : lors du filtrage, on **recopie les indications « système »** (tempo, métronome, repères, segno/coda, sauts) de la première partie vers la première partie conservée, à la même position rythmique. Résultat : timeline du sax ténor seul **identique à MuseScore (0 ms d'écart)** et tempo affiché. Reste à traiter : les textes système sans tempo (« Swing »), qu'on ne peut pas distinguer d'un texte de portée en MusicXML.

## S4 — Transposition

Sur le sax ténor de Unity (écrit en Do majeur) :

| Option Verovio | Armure obtenue | Attendu |
|---|---|---|
| (aucune) | 0 | ✅ |
| `transposeToSoundingPitch: true` | 2 ♭ (Sib majeur) | ✅ sax ténor en Sib |
| `transpose: "Eb"` | 3 ♭ | ✅ |
| `transpose: "+3"` | 3 ♭ | ✅ |
| `transpose: "m3"` | 3 ♭ | ✅ |
| `transpose: "-M2"` (rendu) | Sib majeur | ✅ |

Les trois syntaxes (demi-tons, intervalle, tonalité cible) fonctionnent. **Non testé** (absent du corpus) : grilles d'accords, paroles.

## S5 / S6 — Banc de test sur téléphone

Une page web de test (`spikes/device-test/`) reproduit toute la chaîne : import webmscore → filtrage → Verovio → pages, tap/pédalier, défilement au tempo avec surlignage de la mesure, métronome Web Audio, panneau « Stats » (temps mesurés, touches reçues, régularité du métronome).

Test automatique dans **Chromium headless (émulation Pixel 7)**, sur les 3 fichiers :
- import + affichage OK, aucune erreur JS ;
- touches `ArrowRight` / `PageDown` reçues et pages tournées ;
- défilement au tempo correct : après 4 s à 150 %, la lecture est bien à la mesure attendue et la page tourne seule ;
- métronome : **0 clic en retard**, avance minimale de programmation ≈ 90–100 ms ;
- Wake Lock refusé en headless (il exige un contexte sécurisé et une permission) → à vérifier dans Capacitor.

**À faire par le porteur du projet** (voir [spikes/README.md](../../spikes/README.md)) : ouvrir le banc de test sur un téléphone Android, avec un pédalier Bluetooth si possible, puis relever les Stats.

> **Suite (fin de la phase 2)** : le banc de test n'a pas pu charger de fichier sur le téléphone ; les essais ont été faits directement avec l'APK de l'application. Résultats : [TESTS_APPAREIL.md](../TESTS_APPAREIL.md) (pas de pédalier Bluetooth disponible, son du métronome qui fonctionne, mesures chiffrées encore à faire).

## Ajouts du 2026-11-25 (fichier MuseScore 3.6)

- **Toccata (3.6.2)** : chargement en 0,8 s (Node) / 1,7 s (Chromium), MusicXML et positions OK. 158 événements dans l'ordre de jeu, **ordre identique** dans Verovio.
  - Écart constant de 1,7 s dès la 1ʳᵉ mesure : le fichier contient 7 indications de tempo successives au début (140 → 20). MuseScore et Verovio ne les appliquent pas de la même façon. Ce n'est pas cumulatif. **La timeline MuseScore reste la référence.**
  - Filtrage de la partie de sax alto : **13 indications recopiées**, dont les **repères A à F**, qui s'affichent bien sur la partie seule.
- **Silences multi-mesures** : MuseScore ne les exporte pas en MusicXML (0 `<multiple-rest>`), donc la vue d'une partie montre 11 mesures vides à la suite. Test concluant : en ajoutant `<measure-style><multiple-rest>11</multiple-rest></measure-style>`, Verovio dessine un silence « 11 ».
  - ⚠️ Verovio **fusionne** alors les mesures regroupées en un seul élément `measure` (158 → 148 événements). La table « rang MusicXML → mesure Verovio » doit faire pointer les mesures regroupées vers la mesure du silence multi-mesures.
  - → **Fonction à développer** : regrouper automatiquement les mesures de silence consécutives de la vue filtrée. On coupe le groupe à chaque repère, changement d'armure, de métrique ou de tempo, barre de reprise, volta et double barre.

## Test sur téléphone (tentative du porteur du projet)

- Sur PC, le banc de test marche. Sur le téléphone Android, **le fichier ne se charge pas** : quand on appuie sur « Choisir un fichier », Android ouvre le sélecteur de fichiers, **l'onglet de Chrome est fermé en arrière-plan**, puis rechargé au retour. Le fichier choisi est perdu.
- Cause probable : la page avait **préchargé les deux moteurs** (~200 Mo). Android libère les onglets gourmands quand une autre application passe au premier plan.
- Correctif du banc de test : les moteurs ne sont chargés **qu'après** le choix du fichier.
- ⚠️ **Le même risque existe dans l'application** : Android peut tuer l'activité Capacitor pendant que le sélecteur est ouvert. Mesures prévues :
  1. ne charger webmscore **qu'au moment de l'import**, et libérer Verovio quand on revient à la bibliothèque ;
  2. gérer l'événement Capacitor **`appRestoredResult`** (plugin `@capacitor/app`), qui rend le résultat du sélecteur après une recréation de l'activité ;
  3. sauvegarder l'état de navigation (écran, partition ouverte) pour le restaurer après un redémarrage.

## Conséquences sur les spécifications

1. Import : **un Web Worker webmscore neuf par fichier**, détruit après usage ou après toute erreur. Ne jamais appeler `savePositions(true)`.
2. Le filtrage des parties **recopie les indications système** vers la première partie conservée (module dédié, avec tests).
3. Paramètres d'affichage : ajouter « **noms d'instruments** : complets / abrégés / masqués », et un **zoom par défaut qui dépend du nombre de portées affichées**.
4. Formats : **MuseScore 2.x** est lu aussi (bonus).
5. Tailles réelles : webmscore ~18 Mo, Verovio ~8,4 Mo, soit **~27 Mo de moteurs** dans l'APK.
6. Identifiants des mesures Verovio : retirer le suffixe `-rendN` pour retrouver la mesure d'origine.
7. **Silences multi-mesures générés par l'application** pour la vue filtrée, en tenant compte de la fusion des mesures par Verovio.
8. **Résistance à la mort de l'activité Android** pendant le choix de fichier (`appRestoredResult`, chargement différé des moteurs).
