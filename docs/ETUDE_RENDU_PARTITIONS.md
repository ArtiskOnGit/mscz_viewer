# Étude : bibliothèques open source de rendu de partitions

> Date de l'étude : 2026-11-25. Les versions et l'état des projets sont à revérifier au démarrage du développement (phase 0 de la [ROADMAP](../ROADMAP.md)).

## 1. Le problème à résoudre

L'application doit afficher des fichiers **MuseScore** (`.mscz`, `.mscx`). Ce n'est pas un format d'échange standard :

- un `.mscz` est une **archive ZIP** qui contient un fichier `.mscx` (XML MuseScore), une miniature (`Thumbnails/thumbnail.png`), et depuis MuseScore 4 des fichiers annexes (`audiosettings.json`, `viewsettings.json`, dossier `Excerpts/` pour les parties séparées) ;
- le format `.mscx` **n'est pas documenté officiellement** et **change entre les versions** de MuseScore (3.x, 4.0, 4.x…). Un développeur MuseScore l'a dit sur le forum : tant que MuseScore évolue, le format évolue aussi ;
- **aucune bibliothèque de rendu généraliste** (Verovio, OSMD, VexFlow, alphaTab) ne lit le `.mscx`. Elles lisent toutes du **MusicXML** (et parfois MEI, ABC, Guitar Pro…).

On doit donc soit **réutiliser le moteur de MuseScore lui-même**, soit **convertir le `.mscx` en MusicXML** puis utiliser une bibliothèque de rendu standard.

## 2. Le travail de MuseScore est-il réutilisable librement ?

| Élément | Licence | Réutilisable ? |
|---|---|---|
| **MuseScore Studio 4** (application de bureau, code C++/Qt) | **GPL-3.0** (avec exception pour les polices) | **Oui**, mais tout logiciel dérivé distribué doit être **lui aussi sous GPL-3.0**, avec les sources fournies. |
| Polices musicales **Leland** / **Edwin** (SMuFL) | SIL Open Font License | **Oui**, librement, y compris dans une application non GPL. |
| **Application mobile MuseScore** et **musescore.com** | **Propriétaires** | **Non**. |
| **MuseSounds / Muse Sampler** | Propriétaire, application séparée | **Non** (et inutile ici). |
| Nom et logo « MuseScore » | Marque déposée | Ne pas utiliser dans le nom ou le logo de l'application. On peut écrire « ouvre les fichiers .mscz ». |

### webmscore : MuseScore compilé en WebAssembly

[webmscore](https://github.com/LibreScore/webmscore) (projet LibreScore) est un fork de MuseScore compilé en **WebAssembly**, utilisable en JavaScript (navigateur, WebView, Node). C'est **le seul moyen open source qui lit directement les `.mscz`** avec le vrai moteur de MuseScore.

- **Licence** : GPL (dérivé de MuseScore, fichier `LICENSE.GPL`).
- **Version** : la dernière publiée est la 1.2.1 (janvier 2023), basée sur **MuseScore 4.0**. Le projet semble **peu actif** depuis.
- **Entrées** : `mscz`, `mscx`, `musicxml`, `mxl`, `midi`, Guitar Pro (`gtp`, `gp3`, `gp4`, `gp5`, `gpx`, `gp`), `ptb`.
- **API utile** (déclarations TypeScript de la v1.2.1) :
  - `WebMscore.load(format, data, fonts?, doLayout?)` : charge une partition ;
  - `metadata()` : titre, compositeur, `tempo`, `tempoText`, `duration`, `keysig`, `timesig`, `parts[]` (nom, instrument, programme MIDI, visibilité…), `excerpts[]` ;
  - `npages()`, `saveSvg(page)`, `savePng(page)`, `savePdf()` : rendu avec la mise en page d'origine ;
  - `saveXml()` / `saveMxl()` : **export MusicXML** ;
  - `saveMidi(expandRepeats?)` ;
  - `measurePositions()`, `segmentPositions()`, `savePositions(ofSegments)` : **positions des mesures et des segments**, avec les temps de lecture. C'est ce qu'il faut pour le défilement synchronisé ;
  - `setExcerptId(id)`, `generateExcerpts()` : choix d'une partie séparée ;
  - `setSoundFont()`, `saveAudio()`, `synthAudio()` : synthèse audio (pour plus tard).
  - **Pas de fonction de transposition** dans l'API publique.
- **Taille** : environ 7,4 Mo + 3,9 Mo de WASM d'après le changelog. **Mesuré en phase 0 : ~18 Mo** au total (wasm + mem + data). Il tourne dans un **Web Worker**.
- **Risques** :
  - il est basé sur MuseScore 4.0 : il faut **tester les fichiers créés avec MuseScore 4.1 à 4.6 et plus**. Des éléments récents pourraient être ignorés ou mal lus ;
  - le projet n'est plus maintenu activement. Le recompiler sur une version récente de MuseScore est un gros travail (Emscripten + Qt patché).

## 3. Bibliothèques de rendu évaluées

| Bibliothèque | Licence | Entrées | Transposition | Synchro temps / lecture | Mobile natif | Maintenance | Verdict |
|---|---|---|---|---|---|---|---|
| **[Verovio](https://github.com/rism-digital/verovio)** (RISM) | **LGPL-3.0** | MEI, MusicXML, **MXL**, Humdrum, ABC, PAE, CMME… | **Oui** (`transpose`, `transposeToSoundingPitch`) | **Oui** (`renderToTimemap`, `renderToMIDI`, `getElementsAtTime`, `getTimesForElement`) | WASM/JS, **Android** (liaisons Java SWIG, appli de démo), **iOS** (Swift Package / CocoaPods) | Très active (v6.x) | ✅ **Retenue comme moteur de rendu** |
| **[OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)** (OSMD, basé sur VexFlow) | BSD-3-Clause | MusicXML, MXL | Expérimentale (`TransposeCalculator`, pas de choix d'octave) | Curseur oui. **Lecture audio réservée aux sponsors** | Web uniquement | Active | 🟡 Alternative permissive si on abandonne webmscore |
| **[alphaTab](https://github.com/CoderLine/alphaTab)** | MPL-2.0 | Guitar Pro, MusicXML, alphaTex | Limitée | **Oui**, lecteur et curseur intégrés | Web, .NET, **Kotlin Android** (iOS natif non confirmé) | Active (v1.9) | 🟡 Orientée guitare et tablatures. MusicXML partiel |
| **[VexFlow](https://github.com/vexflow/vexflow)** | MIT | Aucune (API de dessin bas niveau) | Non | Non | Web | Active | ❌ Trop bas niveau |
| **abcjs** | MIT | ABC seulement | Oui | Oui | Web | Active | ❌ Format inadapté |
| **webmscore** | GPL | **mscz/mscx**, MusicXML… | Non (API) | Positions + temps | Web (WASM) | Faible | ✅ **Retenue comme importeur** |

### Points clés de Verovio

- `loadData()` pour le MusicXML, `loadZipDataBuffer()` pour le MXL ;
- `setOptions({ pageWidth, pageHeight, scale, breaks, adjustPageHeight, transpose, … })` puis `redoLayout()` : la **mise en page s'adapte à la taille de l'écran** (téléphone en portrait, tablette en paysage) ;
- `renderToSVG(page)` : sortie SVG. Les éléments (`measure`, `note`…) gardent un identifiant, ce qui permet de surligner la mesure courante ;
- `renderToTimemap({ includeMeasures: true })` : temps en millisecondes de chaque note et de chaque mesure ;
- `select({ measureRange: "12-40" })` : affiche une plage de mesures ;
- polices SMuFL : Leipzig (par défaut) et Bravura. On peut en ajouter d'autres avec `fontAddCustom` (Leland par exemple, à tester).

## 4. Architecture retenue (résumé)

```
                IMPORT (une seule fois)                         AFFICHAGE (à chaque ouverture)
 .mscz ──► webmscore (WASM, worker) ──► MusicXML complet ──► filtre des parties ──► Verovio (WASM, worker) ──► SVG
                     │                  + métadonnées          choisies             + transposition, zoom,
                     │                  + miniature                                   mise en page adaptée
                     └──► timeline (mesures + temps, reprises dépliées) ─────────► défilement automatique
 .musicxml / .mxl ─────────────────────► (direct, sans webmscore ; timeline via la timemap de Verovio)
```

Pourquoi cette combinaison :

1. **webmscore** est le seul outil qui lit fidèlement les `.mscz`. On ne le charge **qu'à l'import** (il pèse environ 11 Mo de WASM et il est lent à initialiser). Il produit un MusicXML et une timeline qu'on met en cache.
2. **Verovio** affiche le MusicXML. Il sait **transposer**, **adapter la mise en page à l'écran** (indispensable sur téléphone), donner la **timemap**, et il est **activement maintenu**.
3. **Choisir plusieurs instruments au choix** devient simple : on retire du MusicXML les `<part>` non sélectionnées avant de le passer à Verovio. Les « parties » prédéfinies d'un `.mscz` ne permettent pas de combiner librement les instruments.
4. La mise en page est **toujours adaptée à l'écran** (choix du porteur du projet, ADR-002). Le rendu SVG de webmscore (`saveSvg()`) ne sert que de plan B technique.

### Plans B

| Problème constaté en phase 0 | Solution de repli |
|---|---|
| webmscore ne lit pas bien les fichiers MuseScore ≥ 4.x récents | a) Demander d'exporter en MusicXML depuis MuseScore (formats pris en charge de toute façon) ; b) Recompiler webmscore sur un MuseScore récent ; c) Écrire un convertisseur `.mscx` → MusicXML en TypeScript (pour un sous-ensemble des éléments) |
| Le rendu Verovio du MusicXML exporté est trop dégradé | Afficher par défaut le SVG de webmscore (fidèle, mais sans transposition ni mise en page adaptée) |
| On veut une application **non GPL** | Retirer webmscore, ne prendre que le MusicXML/MXL, ou écrire notre propre convertisseur. Verovio (LGPL) reste utilisable |

## 5. Conséquences sur la licence de l'application

- Embarquer **webmscore** (GPL) rend l'application **dérivée d'un logiciel GPL**. Le plus simple et le plus honnête : **publier l'application sous GPL-3.0-or-later**, avec les sources publiques. Verovio (LGPL-3.0), les polices OFL et les bibliothèques MIT/BSD sont compatibles.
- **Android** (Play Store, F-Droid, APK) : pas de problème particulier avec la GPL.
- **iOS / App Store** : la compatibilité de la GPL avec les conditions de l'App Store est **contestée**. La FSF les juge incompatibles, et VLC a été retiré de l'App Store en 2011 après une plainte d'un contributeur. Comme le code de MuseScore n'appartient pas à ce projet, un ayant droit pourrait demander le retrait. **Il faut décider avant toute publication iOS** (voir [DECISIONS.md](DECISIONS.md)). Pour un usage personnel, une installation via Xcode sur ses propres appareils reste possible.

## 6. Sources

- webmscore : [README](https://app.unpkg.com/webmscore@1.2.1/files/README.md), [CHANGELOG](https://app.unpkg.com/webmscore@1.2.1/files/CHANGELOG.md), [types TypeScript](https://unpkg.com/webmscore@1.2.1/src/index.d.ts), [dépôt GitHub](https://github.com/LibreScore/webmscore), [npm](https://www.npmjs.com/package/webmscore)
- MuseScore : [README officiel (GPL v3)](https://raw.githubusercontent.com/musescore/MuseScore/main/README.md), [Wikipédia](https://en.wikipedia.org/wiki/MuseScore), [Formats de fichier](https://musescore.org/en/handbook/file-formats), [Documentation du format mscx ?](https://musescore.org/en/node/313044), [MusicXML dans MuseScore 4](https://musescore.org/en/handbook/4/working-musicxml-files), [Code source de Muse Sampler](https://musescore.org/en/node/340466)
- Verovio : [Reference book](https://book.verovio.org/), [Formats d'entrée](https://book.verovio.org/toolkit-reference/input-formats.html), [Méthodes du toolkit](https://book.verovio.org/toolkit-reference/toolkit-methods.html), [Options](https://book.verovio.org/toolkit-reference/toolkit-options.html), [Java/Android](https://book.verovio.org/installing-or-building-from-sources/java-and-android.html), [Swift/iOS](https://book.verovio.org/installing-or-building-from-sources/swift-and-objective-c.html), [GitHub](https://github.com/rism-digital/verovio)
- OSMD : [README](https://unpkg.com/opensheetmusicdisplay@2.0.0/README.md), [Transpose Calculator (discussion #1391)](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/discussions/1391), [osmd-audio-player](https://npmjs.com/package/osmd-audio-player)
- alphaTab : [GitHub](https://github.com/CoderLine/alphaTab), [alphatab.net](https://alphatab.net/docs/introduction), [Artefact Android](https://central.sonatype.com/artifact/net.alphatab/alphaTab-android)
- MEI dans MuseScore : [music-encoding.org](https://music-encoding.org/musescore-doc/)
