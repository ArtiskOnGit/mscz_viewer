# Spécifications techniques

Voir aussi : [Spécifications fonctionnelles](SPECIFICATIONS_FONCTIONNELLES.md) · [Étude des bibliothèques de rendu](ETUDE_RENDU_PARTITIONS.md) · [Décisions](DECISIONS.md) · [Tests sur appareil](TESTS_APPAREIL.md)

> **État au 2026-11-25 (fin de la phase 2)** : ce document décrit ce qui est **construit**. Les écarts avec la spécification d'origine sont signalés par ✏️, ce qui reste à faire par ⬜.

## 1. Choix de la plateforme

### 1.1 Comparaison des approches multiplateformes

Les deux moteurs choisis, **webmscore** et **Verovio**, sont disponibles en **WebAssembly/JavaScript**. Cette contrainte guide le choix du framework.

| Approche | Intégration des moteurs WASM | UI mobile | Complexité | Verdict |
|---|---|---|---|---|
| **Capacitor + application web (TypeScript)** | Directe, dans la même WebView et des Web Workers | Bonne avec Ionic | **Une seule pile technique** | ✅ **Retenue** |
| Flutter + WebView pour la partition | Passerelle Dart ↔ JS pour chaque action (page, zoom, scroll) | Excellente | Deux piles (Dart + JS), synchro délicate | 🟡 |
| React Native + WebView | Même problème de passerelle | Très bonne | Deux mondes (RN + WebView) | 🟡 |
| Natif (Kotlin + Swift) avec Verovio C++ | Verovio natif possible, **mais webmscore n'existe qu'en WASM** | Excellente | Deux applications à écrire | ❌ |

**Choix : Capacitor + Ionic React + TypeScript** (ADR-004). Une seule base de code pour Android, iOS et **navigateur** : on développe et on teste sur ordinateur (Vite + Chromium headless), les moteurs WASM tournent dans des **Web Workers**, l'accès natif passe par des plugins Capacitor. Plan B si le rendu SVG est trop lent sur les appareils modestes : Verovio natif (C++) via un plugin.

### 1.2 Pile technique (telle que construite)

| Domaine | Choix | Rôle |
|---|---|---|
| Langage | **TypeScript 6.0** (strict), épinglé `~6.0.3` (ADR-022) | |
| Build | **Vite 8** | Workers en modules ES ; Verovio exclu du pré-bundling |
| UI | **React 19** + **Ionic React 9** + **React Router 6** (ADR-014) | Composants mobiles (listes, modales, segments, toasts), navigation |
| État | **Zustand** | `libraryStore`, `setlistStore`, `settingsStore` |
| Workers | **Comlink** | Appels vers le worker Verovio |
| Import | **webmscore 1.2.1** (MuseScore 4.0 en WASM) | **Tous les formats** (`.mscz`, `.mscx`, `.mxl`, `.musicxml`) → MusicXML + métadonnées + positions (ADR-017) |
| Rendu | **Verovio 6.4.1** (`verovio/wasm` + `verovio/esm`) | MusicXML → SVG, transposition |
| ZIP | **fflate** | Miniature des `.mscz`, parties masquées (ADR-018), `.mxl` |
| Coquille native | **Capacitor 8.6** | Android (iOS en phase 3) |
| Fichiers | `@capacitor/filesystem` | Partitions dans l'espace privé (`Directory.Data`) |
| Préférences | `@capacitor/preferences` | Paramètres globaux (clé `settings`) |
| Sélecteur de fichiers | `@capawesome/capacitor-file-picker` | Import multi-fichiers |
| Écran allumé | `@capacitor-community/keep-awake` | |
| Ouvrir avec | `@capacitor/app` (`appUrlOpen`, URL de lancement) + `intent-filter` `VIEW` | |
| Partager vers | `@capgo/capacitor-share-target` (MPL-2.0) + `intent-filter` `SEND` / `SEND_MULTIPLE` | Fichiers copiés dans le cache de l'application (ADR-024) |
| Survie au sélecteur de fichiers | `@capacitor/app` (`appRestoredResult`) | Android peut tuer l'activité pendant le sélecteur (phase 0) |
| i18n | **i18next 27** + **react-i18next** + `eslint-plugin-i18next` | EN (référence), FR |
| Tests | **Vitest 5** (unitaires, environnement Node ; Verovio WASM chargé dans certains tests) + **Playwright** (scripts `e2e/`, Chromium headless) | |
| Lint | ESLint 10 + typescript-eslint + `eslint-plugin-react-hooks` 7 (règles du compilateur React) | ✏️ Pas de Prettier |
| CI | **GitHub Actions** : web + APK de debug (ADR-015, ADR-016) | ✏️ Pas de runner iOS pour l'instant |

✏️ Non utilisé : `@capacitor/screen-orientation` (l'orientation suit l'appareil ; verrouillage ⬜).

Cibles : **Android 7.0+ (API 24, défaut de Capacitor 8)**, cible API 36 ; iOS 15+ en phase 3. La WebView Android se met à jour via le Play Store, donc WASM et les Web Workers sont disponibles.

## 2. Architecture

### 2.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Thread principal (UI React/Ionic)                    │
│  Écrans : Bibliothèque (Scores | Setlists) · Détail setlist ·             │
│           Visualisation (Pages | ContinuousView) · Paramètres             │
│  Stores : libraryStore · setlistStore · settingsStore                     │
│  Services : LibraryRepository · ViewStateRepository · SetlistRepository · │
│             importScore · RenderService · PlaybackEngine (horloge Web     │
│             Audio + clics) · gestes / pédalier (usePageGestures, keydown) │
└───────────────┬────────────────────────────────┬─────────────────────────┘
                │ webmscore (worker interne)     │ Comlink
     ┌──────────▼───────────┐        ┌───────────▼────────────┐ ┌────────────────────────┐
     │ worker webmscore     │        │ render.worker.ts       │ │ 2e render.worker.ts    │
     │  MuseScore 4.0 WASM  │        │  Verovio (WASM)        │ │  (setlist : morceau    │
     │  chargé à l'import,  │        │  un par partition      │ │  suivant pré-chargé,   │
     │  un neuf par fichier │        │  ouverte               │ │  ADR-021)              │
     └──────────┬───────────┘        └───────────┬────────────┘ └────────────────────────┘
                │                                │
     ┌──────────▼────────────────────────────────▼───────────┐
     │  Stockage : Filesystem (Directory.Data) + Preferences │
     └───────────────────────────────────────────────────────┘
```

### 2.2 Organisation du code

```
mscz_viewer/
├── README.md, ROADMAP.md, docs/
├── .github/workflows/ci.yml     # lint, typecheck, tests, build web, APK de debug
├── scripts/copy-webmscore.mjs   # copie les fichiers de webmscore dans public/ (postinstall)
├── src/
│   ├── app/                     # App, routes, thème, licences tierces
│   ├── screens/
│   │   ├── library/             # LibraryScreen, ScoreItem, ScoreInfoModal, miniatures
│   │   ├── setlists/            # SetlistsTab, SetlistDetailScreen, SetlistBar, useSetlistPlayback, preloadNext
│   │   ├── viewer/              # ViewerScreen, ContinuousView, useScoreViewer, usePlayback, usePageGestures,
│   │   │                        # useLongPress, PartsModal, TransposeModal, GoToModal, pieceData
│   │   └── settings/            # SettingsScreen, PedalKeysSection, StorageSection
│   ├── core/                    # logique sans interface, testée (Vitest)
│   │   ├── model/               # types : Score, Part, Timeline, ScoreViewState, Setlist
│   │   ├── storage/             # FileStore, LibraryRepository, ViewStateRepository, SetlistRepository
│   │   ├── import/              # importScore (+ réimport), formats, webmscoreEngine, unhideParts, openWith
│   │   ├── musicxml/            # filterParts (ADR-012), multiRests, prepareDisplay
│   │   ├── render/              # RenderService, render.worker.ts, options Verovio, transposeOption, cache disque (renderCache)
│   │   ├── timeline/            # timeline depuis les positions webmscore, métriques
│   │   ├── playback/            # PlaybackClock, clics du métronome, PlaybackEngine, table des mesures
│   │   ├── navigation/          # aller à, demi-page, touches du pédalier, mode Continu (fenêtre, lissage)
│   │   ├── music/               # tonalités, transposition, préférence ♯/♭
│   │   ├── setlists/            # réglages effectifs (surcharge d'entrée)
│   │   ├── profile/             # « My instrument »
│   │   └── settings.ts          # AppSettings, valeurs par défaut, chargement
│   ├── state/                   # stores Zustand
│   ├── ui/                      # formatage (durées…)
│   └── i18n/                    # locales/en/*.json (référence), locales/fr, test de complétude
├── e2e/                         # scripts Playwright (voir §13)
├── android/                     # projet Capacitor (intent-filter « Ouvrir avec »)
├── spikes/                      # code jetable de la phase 0
└── test-scores/                 # corpus personnel, non versionné
```

## 3. Modèle de données

### 3.1 Types principaux (extrait de `src/core/model/types.ts`)

```ts
type ScoreId = string; // UUID v4

interface Score {
  id: ScoreId;
  title: string;            // modifiable par l'utilisateur
  originalTitle: string;
  subtitle?: string;
  composer?: string;
  sourceFormat: 'mscz' | 'mscx' | 'mxl' | 'musicxml';
  sourceFileName: string;
  sourceHash: string;       // SHA-256 du fichier d'origine (doublons)
  importedAt: string;       // ISO 8601
  lastOpenedAt?: string;
  importerVersion: number;  // version du pipeline d'import : réimport automatique si < IMPORTER_VERSION (ADR-018)
  museScoreVersion?: string;
  measures: number;
  durationSec?: number;
  initialTempoBpm?: number;
  parts: Part[];
  rehearsalMarks: { label: string; measureIndex: number }[];
  tags: string[];           // phase 4
}

interface Part {
  index: number;
  musicXmlId: string;       // <score-part id="P1">
  name: string;
  instrumentId?: string;    // identifiant MuseScore (ex. "bb-trumpet")
  midiProgram?: number;
  hiddenInSource?: boolean; // masquée dans MuseScore : pas affichée par défaut
}

/** Ordre de jeu réel, reprises dépliées. */
interface Timeline {
  source: 'webmscore' | 'verovio';   // toujours 'webmscore' aujourd'hui (ADR-017)
  events: TimelineEvent[];
  totalMs: number;
}
interface TimelineEvent {
  measureIndex: number;     // rang de la mesure dans le MusicXML (0-based)
  startMs: number;          // au tempo d'origine
  durationMs: number;
  timeSig: { beats: number; beatType: number };
}

interface SetlistItem {
  id: string;               // une même partition peut apparaître plusieurs fois
  scoreId: ScoreId;
  note?: string;
  override?: Partial<Pick<ScoreViewState,
    'selectedParts' | 'transposeSemitones' | 'transposeOctave' | 'concertPitch' | 'accidentalPreference'>>;
}

/** Réglages mémorisés pour chaque partition (viewstates.json). */
interface ScoreViewState {
  scoreId: ScoreId;
  selectedParts: string[];  // vide = parties par défaut (visibles dans MuseScore)
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
  accidentalPreference: 'auto' | 'sharps' | 'flats';
  zoom: number | 'auto';    // facteur relatif au zoom automatique
  layoutMode: 'pages' | 'continuous';
  lastPage: number;
  lastMeasureIndex?: number;
  tempoFactor: number;      // 0.5 – 1.5
  metronomeEnabled: boolean;
}
```

✏️ Écarts avec le modèle d'origine : pas de `arranger`, `keySignature`, `timeSignature` dans `Score` ; `Part` sans `staves` / `transposition` / `hasTab` / `hasDrums` (lus dans le MusicXML au besoin) ; pas de `bpm` / `beatOffsetsMs` dans la timeline (le métronome bat les temps de la métrique sur la durée de la mesure).

**Paramètres globaux** (`AppSettings`, `src/core/settings.ts`, clé Preferences `settings`, fusionnés avec les valeurs par défaut au chargement) : `appTheme`, `scoreTheme`, `partNames`, `multiRests`, `tapZones`, `swipe`, `keepAwake`, `defaultZoom`, `countInMeasures`, `countInSound`, `metronomeVolume`, `highlightMeasure`, `tapPauses`, `myInstrument` (noms + identifiants d'instruments), `defaultTranspose`, `pedalKeys` (codes de touches par action : `next`, `prev`, `playPause`, `metronome`, `nextPiece`, `previousPiece`), `halfPageTurn`, `defaultLayoutMode`, `readingLine`.

### 3.2 Stockage sur l'appareil

```
Directory.Data/
├── library.json                    # index des partitions
├── viewstates.json                 # { [scoreId]: ScoreViewState }
├── setlists.json                   # setlists
└── scores/<scoreId>/
    ├── original.<ext>              # fichier d'origine (conservé pour le réimport)
    ├── score.musicxml              # MusicXML complet (sortie de l'import)
    ├── timeline.json
    └── thumbnail.png               # si présente dans le .mscz
```

- Écritures d'index **atomiques** (fichier temporaire puis renommage), file d'attente d'écritures par dépôt.
- ✅ **Cache disque des pages rendues** (ADR-025) dans `Directory.Cache` (Android peut le vider ; il se reconstruit) :

```
Directory.Cache/render-cache/
├── index.json                      # { [clé]: { bytes, lastUsed, pages } } — taille et LRU
└── <clé>/                          # clé = SHA-256(XML affiché + options Verovio + versions)
    ├── layout.json                 # nombre de pages, identifiants des mesures, page de chaque mesure
    └── <n>.svg                     # pages déjà rendues
```
- Migrations : par `importerVersion` pour les partitions (réimport) et par fusion avec les valeurs par défaut pour les paramètres et les réglages de partition.
- Passage à SQLite derrière les mêmes interfaces si le volume l'exige.

## 4. Pipeline d'import (`src/core/import/importScore.ts`)

webmscore n'est chargé qu'au premier import (script `webmscore.js` + fichiers `webmscore.lib.*` servis à la racine des assets, copiés par `scripts/copy-webmscore.mjs`).

1. **Lecture** des octets (sélecteur de fichiers, ou URL `content://` / `file://` d'un intent « Ouvrir avec »).
2. **Empreinte** SHA-256 (WebCrypto) → un fichier identique n'est pas réimporté.
3. **Détection du format** : extension + signature (`PK` = ZIP ; contenu `.mscx` → mscz, `META-INF/container.xml` → mxl).
4. **Parties masquées** (mscz/mscx, ADR-018) : une copie du fichier rend visibles toutes les parties et portées ; les index des parties masquées sont mémorisés (`hiddenInSource`).
5. **Conversion par webmscore** (tous les formats, ADR-017) : `WebMscore.load(format, bytes)` démarre **un worker neuf par fichier** (une erreur WASM rend l'instance inutilisable), puis `metadata()`, `saveXml()` (MusicXML complet), `savePositions(false)` (positions des mesures dans l'ordre de jeu, reprises dépliées). ⚠️ **Jamais `savePositions(true)`** (plante). `destroy()` termine le worker.
6. **Timeline** : positions webmscore + **métrique de chaque mesure** lue dans le MusicXML.
7. **Métadonnées** : titre (textes d'exemple de MuseScore ignorés), compositeur, parties, mesures, durée, tempo initial, marques de répétition, version de MuseScore.
8. **Miniature** : `Thumbnails/thumbnail.png` de l'archive (fflate).
9. **Écriture** des fichiers puis de l'index.
10. **Erreurs typées** (`unsupportedFormat`, `emptyFile`, `engineFailed`, `invalidMusicXml`) → message adapté dans l'interface.
11. **Réimport automatique** : au chargement de la bibliothèque, les partitions dont `importerVersion < IMPORTER_VERSION` sont reconverties depuis `original.<ext>` (identifiant, titre et réglages conservés).

## 5. Pipeline de rendu

Exécuté dans `render.worker.ts` (Verovio WASM, via Comlink). Une instance par partition ouverte, terminée à la fermeture.

1. **XML affiché** (`prepareDisplay`, thread principal, **une seule analyse DOM** et au plus une sérialisation pour toutes les étapes, ADR-025) :
   - **filtrage des parties** : on retire les `<score-part>` / `<part>` non sélectionnés et les groupes vides, en **recopiant les indications système** (tempo, métronome, repères, sauts) vers la première partie conservée (ADR-012) ;
   - **silences multi-mesures** regroupés (`<multiple-rest>`), coupés aux repères, changements d'armure/métrique/tempo, reprises, voltas et doubles barres ; la table « mesure MusicXML → mesure rendue » en tient compte ;
   - **noms d'instruments** masqués pour une partie seule (option) ;
   - **tonalité** de la première partie affichée (et `<transpose><chromatic>` pour la hauteur réelle).
2. **Options Verovio** (`verovioOptions`) : `scale` (zoom automatique selon le nombre de portées × zoom de la partition), `pageWidth` / `pageHeight` = zone d'affichage en unités Verovio, marges 40, `breaks: 'auto'` (ADR-002), `adjustPageHeight` **vrai en mode Continu** (ADR-019), `header` / `footer: 'none'`, `systemDivider: 'none'`, `svgViewBox`, `transpose`, `transposeToSoundingPitch` (hauteur réelle).
3. **Transposition** (ADR-020) : quand la tonalité est connue, `transpose` reçoit un **intervalle** (`m2`, `-A1`, `M9`, `-d2`…) calculé à partir de la tonalité d'arrivée choisie (préférence auto/♯/♭) ; sinon un nombre de demi-tons. Comportement vérifié contre Verovio 6.4 dans les tests unitaires.
4. `loadData(xml)` quand le contenu change (parties, transposition, options d'affichage) ; `redoLayout()` quand seule la géométrie change (taille, rotation, zoom, mode Pages/Continu). Après chaque mise en page : nombre de pages, identifiants des mesures (`getMEI()`), page de chaque mesure (`getPageWithElement`), en un seul aller-retour. Identifiants **déterministes** (`xmlIdSeed`) : une partition rechargée garde les mêmes.
   - **Cache disque** (ADR-025) : avant Verovio, `RenderService` calcule la clé (SHA-256 du XML affiché, de l'objet d'options Verovio entier à clés triées, des versions de Verovio et de l'application) ; si la mise en page est en cache, elle et les pages en cache sont servies **sans charger la partition dans Verovio** ; le worker n'est mis à jour (chargement ou nouvelle mise en page) que pour une page absente ou un élément inconnu. Chaque page rendue est écrite en arrière-plan. 64 Mo au plus, éviction LRU ; Paramètres → Stockage montre l'espace utilisé et vide le cache.
   - Le worker et Verovio (WASM, ≈ 1 s) **démarrent dès l'ouverture** de la visualisation, pendant la lecture des fichiers.
5. **Rendu paresseux** :
   - mode **Pages** : page courante puis pré-rendu de n+1, n−1, n+2 ; cache en mémoire jusqu'à la mise en page suivante ;
   - mode **Continu** : pages empilées dans un défilement natif ; seules les pages proches de la position de lecture sont dans le DOM (4 rendues, 8 gardées), les autres sont des emplacements de hauteur mesurée ou estimée ; ancrage du défilement géré par la vue (`overflow-anchor: none`).
6. **Position conservée** à chaque nouvelle mise en page : première mesure de la page (mode Pages) ou première mesure à l'écran (mode Continu), retrouvée avec `getPageWithElement`.

**Thèmes** : le SVG est inséré dans le DOM ; Verovio dessine en `currentColor`, la couleur vient de variables CSS par thème de partition (`data-score-theme`).

**Objectifs de performance** (téléphone milieu de gamme, à mesurer) : première page en moins de 1,5 s ; tournage de page pré-rendue en moins de 100 ms ; relayout après zoom en moins de 1 s pour une partie seule de 200 mesures. Mesures e2e (PC, Chromium) : ouverture du morceau suivant d'une setlist ≈ 1,5 s, ≈ 0,4 s pré-chargé.

Mesures `e2e/performance.mjs` (PC, Chromium headless, Pixel 7 émulé), avant → après ADR-025 :

| | Toccata (7 parties, 122 mesures, 1,6 Mo) | Medley (5 parties, 143 mesures, 1,2 Mo) |
|---|---|---|
| Préparation du XML (conducteur) | 191 → 67 ms | 209 → 69 ms |
| Démarrage de Verovio (worker + WASM) | ≈ 1,1 s | ≈ 1,1 s |
| Chargement + mise en page Verovio | ≈ 0,8 s | ≈ 0,5 s |
| Nouvelle mise en page (zoom) | ≈ 0,35 s | ≈ 0,25 s |
| Première ouverture (clic → 1re page) | 3,6 → 2,8 s | 3,0 → 2,1 s |
| Réouverture (cache disque) | 2,9 → 0,84 s | 2,4 → 0,73 s |

Workers : aucun après un import, aucun après avoir quitté la visualisation ou une setlist, au plus 2 pendant une setlist (vérifié par l'e2e).

## 6. Défilement automatique et métronome

### 6.1 Timeline

- **Source** : positions webmscore à l'import (ordre de jeu réel : reprises, voltas, D.C./D.S./Coda, changements de tempo), pour tous les formats (ADR-017).
- **Correspondance des mesures** : `measureIndex` = rang de la mesure dans le MusicXML (0-based) → mesure rendue par Verovio (table tenant compte des silences multi-mesures fusionnés) → identifiant SVG → page. On se base toujours sur le rang, jamais sur le numéro affiché ; « Aller à » accepte le numéro imprimé (`number` du MusicXML) ou le rang.

### 6.2 Horloge partagée (`PlaybackClock`)

Le défilement et le métronome lisent la **même horloge** : temps partition = temps écoulé × facteur de tempo + décalage ; changer le facteur recalcule le décalage, sans saut. Source de temps : `AudioContext.currentTime`.

### 6.3 Moteur (`PlaybackEngine`) et défilement

- Chaque image (`requestAnimationFrame`) : événement courant de la timeline (recherche dichotomique) et progression dans la mesure → `onFrame(index, progression)`.
- **Mode Pages** : surlignage de la mesure courante ; la page tourne quand la moitié de la dernière mesure de la page est jouée ; saut arrière immédiat pour une reprise. ⬜ Avance de N mesures.
- **Mode Continu** (ADR-019) : position cible = haut du système de la mesure courante, interpolé vers le système suivant selon (rang de la mesure dans le système + progression) / nombre de mesures du système ; `scrollTop` cible = cette hauteur − ligne de lecture × hauteur d'écran. Lissage par un **ressort à amortissement critique** (solution exacte sur le pas de temps : stable et sans oscillation à toute fréquence d'images ; retard ≈ 2v/ω, ω = 5 s⁻¹) ; saut immédiat si la cible recule de plus de 10 % d'écran (reprise) ou avance de plus de 75 % ; suivi suspendu 1,5 s après un défilement au doigt. Le surlignage est réappliqué quand la page de la mesure courante vient d'être rendue.
- **Départ** : position de pause si elle est à l'écran, sinon première mesure de la page (Pages) ou première mesure à l'écran (Continu), ou mesure choisie par « Aller à ».
- **Décompte** : N mesures de la métrique de la première mesure jouée, clic sonore en option même métronome coupé.
- **Pause** : toucher (option), pédalier, passage en arrière-plan.

### 6.4 Métronome

Aucune lecture audio de la partition (ADR-010) ; le métronome est le seul son.
- **Son** : Web Audio, oscillateur court avec enveloppe, fréquence plus aiguë pour l'accent du premier temps. Aucun fichier audio.
- **Ordonnancement** : « lookahead scheduler » (minuterie toutes les 25 ms qui programme les clics des 120 ms suivantes avec `osc.start(t)`). Jamais de son déclenché par `setTimeout`.
- **Temps des clics** : calculés depuis la timeline (métrique de chaque mesure, reprises comprises) et le facteur de tempo.
- **Métronome seul** : le même moteur suit la timeline depuis la première mesure de la page affichée, sans décompte, surlignage ni tournage.
- **Indicateur visuel** : point clignotant à chaque temps.
- ⬜ Compensation de latence (`outputLatency`), subdivisions, BPM saisi.

## 7. Entrées utilisateur

- **Gestes** (`usePageGestures`, pointer events) : tap par zones (tiers gauche/droit = précédent/suivant, centre = barres d'outils), **appui long** (0,5 s sans bouger) = choisir la mesure de départ du défilement, balayage horizontal, pincement (CSS `transform: scale` pendant le geste, nouvelle mise en page à la fin). En mode Continu, la zone de partition a `touch-action: pan-y` : le défilement vertical est natif, les taps, balayages horizontaux et pincements restent en JS (pincement à vérifier sur téléphone).
- **Appuis longs** (`useLongPress`) : 0,6 s sur le métronome = métronome seul ; 0,8 s sur le cadenas = déverrouillage.
- **Appui long sur une mesure** (0,5 s, modes Pages et Continu, pas en mode verrouillé) : la mesure sous le doigt est l'élément `g.measure` sous le point (`elementsFromPoint` puis `closest`), sinon celle dont le rectangle contient le point ou la plus proche sur la même ligne (`boxAtPoint` ; en demi-page, seule la couche visible à cette hauteur). Son identifiant SVG donne la mesure rendue (`measureIds`), puis la première mesure MusicXML qu'elle dessine (`xmlToRendered`, silences multi-mesures compris : `xmlMeasureOfId`). L'événement de départ est sa première occurrence dans la timeline à partir de la position courante (événement joué, position de pause ou première mesure à l'écran), sinon la dernière avant (`eventOfMeasureFrom`). Le ▶ suivant part de là ; pendant la lecture, relance immédiate. Marque visuelle : règle CSS injectée pour l'identifiant choisi (elle s'applique aussi aux pages rendues plus tard en mode Continu).
- **Clavier / pédalier** : écouteur `keydown` global sur la Visualisation (ignoré dans les champs de saisie et les modales), table `KeyboardEvent.code` → action configurable (`src/core/navigation/pedalKeys.ts`) :

| Action | Touches par défaut |
|---|---|
| Page suivante (Continu : un écran plus bas) | `ArrowRight`, `ArrowDown`, `PageDown`, `Space`, `Enter`, `NumpadEnter` |
| Page précédente | `ArrowLeft`, `ArrowUp`, `PageUp`, `Backspace` |
| Lecture / pause | `KeyP`, `MediaPlayPause` |
| Métronome marche/arrêt | `KeyM` |
| Morceau suivant / précédent (setlist) | `MediaTrackNext` / `MediaTrackPrevious` |

  Une touche n'appartient qu'à une action ; des paramètres enregistrés avant l'ajout d'une action reçoivent ses touches par défaut, sauf celles déjà prises. ✏️ Pas d'action sur appui long au pédalier. ⚠️ Réception des touches d'un vrai pédalier Bluetooth dans la WebView Android non vérifiée.
- **Mode verrouillé** : seuls les tournages de page (zones, balayage, défilement natif) et le pédalier restent actifs ; pas de pincement.

## 8. Intégration native

| Besoin | Android (fait) | iOS (phase 3) |
|---|---|---|
| Ouvrir avec | ✅ `intent-filter` `ACTION_VIEW` (`content`/`file`, MIME `application/x-musescore`, MusicXML, `octet-stream`, `zip`, `xml`…) ; le contenu est vérifié avant l'import. Validé sur téléphone (2026-11-26) | `CFBundleDocumentTypes` + UTI |
| Partager vers | ✅ `intent-filter` `ACTION_SEND` / `ACTION_SEND_MULTIPLE` (mêmes MIME) + `@capgo/capacitor-share-target` : fichiers copiés dans le cache, lus, importés puis effacés ; démarrage à froid et à chaud (ADR-024). ⚠️ Non essayé sur téléphone | Extension de partage |
| Écran allumé | ✅ plugin keep-awake | plugin |
| Réseau | ✏️ La permission `INTERNET` est encore déclarée (défaut de Capacitor) ; l'application ne fait aucun appel réseau. ⬜ La retirer avant publication | Pas de réseau |
| Stockage | Stockage interne de l'application | `Library/` ou `Documents/` |

## 9. Setlists

- Stockage : `setlists.json` via `SetlistRepository` (écritures atomiques).
- Les entrées référencent les partitions par `scoreId`. Supprimer une partition retire ses entrées des setlists, avec un message listant les setlists concernées.
- **Mode setlist** : route `/viewer/:scoreId?setlist=…&item=…`. Réglages effectifs = réglages de la partition ← surcharge de l'entrée. En mode setlist, les changements d'instruments et de transposition (préférence ♯/♭ comprise) vont **dans la surcharge** ; zoom, page, mode d'affichage, tempo vont dans les réglages de la partition. Changer de morceau remonte l'écran de visualisation.
- **Pré-chargement** (ADR-021) : quand le morceau courant est affiché, le suivant est préparé dans un second worker Verovio (fichiers, XML affiché, mise en page, première page). Un seul emplacement. Ouverture ≈ 0,4 s au lieu de ≈ 1,5 s (e2e). ⬜ Mémoire à mesurer sur téléphone.
- Durée totale : somme des durées des partitions.

## 10. Fonctionnement hors ligne

- Tous les fichiers (JS, WASM webmscore/Verovio, polices) sont **embarqués dans l'application**. Aucun CDN, pas de télémétrie, aucun appel réseau.
- ⬜ Version PWA (service worker) : non prévue pour l'instant.

## 11. Internationalisation (ADR-009)

- **Anglais = langue de référence** : `src/i18n/locales/en/` (`common`, `library`, `viewer`, `settings`, `setlists`).
- **Aucune chaîne visible en dur** : la règle `i18next/no-literal-string` bloque le lint (et la CI). `src/i18n/i18n.test.ts` vérifie la complétude des langues.
- Pluriels i18next selon les catégories `Intl.PluralRules` de chaque langue (`_one` / `_other` ; `_many` du français facultatif : i18next retombe sur `_other`) ; dates et durées formatées via `Intl` avec la langue courante.
- Traduction française : espaces insécables (`\u00a0`) avant « : ; ! ? % » et dans les « guillemets », vérifiées par le test i18n ; placeholders `{{…}}` identiques à l'anglais.
- Noms de tonalités en notation anglaise (C, D♭…) dans le code (`core/music/keys.ts`), convertis à l'affichage par `noteName` / `keyName(…, naming)` : anglaise, latine (Do Ré Mi, accents compris) ou allemande (H = Si, B = Si♭). Réglage `noteNaming` (`auto` = latine en français, anglaise sinon ; hook `useNoteNaming`).
- ✅ Traduction française et réglage `language` (`system` = langue de l'appareil si traduite, sinon anglais), appliqué par `applyLanguage` (i18n.changeLanguage + `<html lang>`) au chargement des paramètres et à chaque changement. ⬜ Plateforme de traduction ensuite.
- Les scripts e2e existants forcent `locale: 'en-US'` (ils cherchent des libellés anglais) ; `e2e/i18n-fr.mjs` teste l'interface en français.
- Libellés prévus pour supporter +40 % de longueur ; CSS en propriétés logiques quand c'est possible.

## 12. Taille et ressources

| Élément | Taille |
|---|---|
| webmscore (WASM + JS + données) | **~18 Mo** (mesuré en phase 0) |
| Verovio (WASM intégré au JS) | **~8,4 Mo** (2,5 Mo gzip) |
| Application (JS/CSS) | moins de 2 Mo |
| **Total de l'application installée** | **environ 30 Mo** |

Mémoire : webmscore n'est chargé qu'à l'import (un worker par fichier, terminé ensuite). Verovio : une instance par partition ouverte, plus une pour le morceau suivant en setlist. En mode Continu, le nombre de pages dans le DOM est borné. À surveiller sur téléphone : gros conducteurs (30 parties et plus), appareils modestes, et Android qui tue une application gourmande quand le sélecteur de fichiers passe au premier plan.

## 13. Qualité et tests

- **Corpus** (`test-scores/`, non versionné, fichiers du porteur) : MuseScore 2.1, 3.6.2, 4.5.2, 4.6.2 ; reprises et voltas, nombreux changements de tempo et de métrique, marques de répétition, instruments transpositeurs, batterie, parties masquées. ⬜ À compléter : grilles d'accords, paroles, D.S. al Coda, piano, tablature.
- **Tests unitaires** (Vitest, `src/**/*.test.ts`, 195 tests) : filtrage MusicXML, silences multi-mesures, préparation du XML affiché en une passe, parties masquées, formats et import, « Ouvrir avec » et « Partager vers », timeline, clics du métronome et horloge, navigation (aller à, demi-page, touches du pédalier, mesure touchée : identifiant SVG → mesure MusicXML → événement de départ, mesure sous le doigt), mode Continu (fenêtre de rendu, lissage), tonalités et préférence ♯/♭ (dont **Verovio réel**), options Verovio, cache disque des pages (clé, LRU, effacement), réglages effectifs des setlists, dépôt des setlists, profil « My instrument », complétude i18n (clés, pluriels par langue, placeholders, typographie française), notation des notes.
- **Tests de bout en bout** (`e2e/*.mjs`, Playwright, Chromium headless, émulation Pixel 7 ; chaque script lance son serveur Vite) : `smoke`, `library`, `viewer`, `continuous`, `navigation`, `playback`, `transpose`, `setlists`, `profile`, `settings`, `i18n-fr` (navigateur en français), `pickbar` (appui long sur une mesure, pages venant du cache disque), `performance` (temps d'ouverture des gros conducteurs, préparation du XML, Verovio, workers restants, Paramètres → Stockage ; affiche un résumé JSON). Usage : `node e2e/<script>.mjs "$PWD" /tmp/dossier-captures`. Les scripts récents sortent avec le code 1 si une vérification échoue. Ils ne tournent pas encore dans la CI (corpus non versionné).
- ⬜ **Tests de non-régression visuels** (phase 3).
- **Tests sur appareil** (manuels) : voir [TESTS_APPAREIL.md](TESTS_APPAREIL.md).

## 14. Licence et conformité

- Licence de l'application : **GPL-3.0-or-later** (à cause de webmscore), fichier `LICENSE`. Voir ADR-003. Le dépôt est public depuis le 2026-11-25.
- Écran « Licenses » dans l'application : liste des composants tiers et de leurs licences (`src/app/thirdPartyLicenses.ts`, maintenue à la main). ✏️ Pas de génération automatique.
- Lien vers le dépôt des sources dans « About ».
- Ne pas utiliser le nom ni le logo « MuseScore » dans le nom, l'icône ou la fiche store. Mention de marque dans « About ».

## 15. Intégration continue et distribution

- **CI** (`.github/workflows/ci.yml`, dépôt public `ArtiskOnGit/mscz_viewer` ; releases : `.github/workflows/release.yml`, ADR-023), à chaque push sur `main` et à chaque pull request :
  1. job *web* : `npm ci`, lint, typecheck, tests unitaires, build web (artefact `web-dist`) ;
  2. job *android* : build web, `npx cap sync android`, `./gradlew assembleDebug` (JDK 21) → artefact **`pupitre-debug-apk`** (14 jours).
- **Signature** : clé de debug fixe restaurée depuis le secret `ANDROID_DEBUG_KEYSTORE_B64` (ADR-016), pour que chaque APK s'installe par-dessus le précédent.
- **Installation** : `gh run download --name pupitre-debug-apk`, copie de `app-debug.apk` sur le téléphone (voir README).
- ⬜ Phase 3 : APK/AAB de release signé avec une clé de publication, GitHub Releases, F-Droid, Google Play ; build iOS sur runner macOS.
