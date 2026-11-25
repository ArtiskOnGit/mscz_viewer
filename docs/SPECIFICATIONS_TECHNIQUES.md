# Spécifications techniques

Voir aussi : [Spécifications fonctionnelles](SPECIFICATIONS_FONCTIONNELLES.md) · [Étude des bibliothèques de rendu](ETUDE_RENDU_PARTITIONS.md) · [Décisions](DECISIONS.md)

## 1. Choix de la plateforme

### 1.1 Comparaison des approches multiplateformes

Les deux moteurs choisis, **webmscore** et **Verovio**, sont disponibles en **WebAssembly/JavaScript**. Cette contrainte guide le choix du framework.

| Approche | Intégration des moteurs WASM | UI mobile | Complexité | Verdict |
|---|---|---|---|---|
| **Capacitor + application web (TypeScript)** | Directe, dans la même WebView et des Web Workers | Bonne avec Ionic | **Une seule pile technique** | ✅ **Retenue** |
| Flutter + WebView pour la partition | Passerelle Dart ↔ JS pour chaque action (page, zoom, scroll) | Excellente | Deux piles (Dart + JS), synchro délicate | 🟡 |
| React Native + WebView | Même problème de passerelle | Très bonne | Deux mondes (RN + WebView) | 🟡 |
| Natif (Kotlin + Swift) avec Verovio C++ | Verovio natif possible, **mais webmscore n'existe qu'en WASM** | Excellente | Deux applications à écrire | ❌ |

**Choix : Capacitor + Ionic React + TypeScript** (ADR-004 acceptée). React est retenu parce que c'est l'option la plus simple et la mieux documentée. Ionic prend officiellement en charge Angular, React et Vue, mais pas Svelte.
- Une seule base de code pour Android, iOS et **navigateur**. On peut développer et tester sur ordinateur dans Chrome, et la même application peut servir de PWA.
- Les moteurs WASM tournent dans des **Web Workers** pour ne pas bloquer l'interface.
- L'accès natif nécessaire (fichiers, écran allumé, « Ouvrir avec », orientation) passe par des plugins Capacitor.
- Point faible : les performances de rendu SVG sur les appareils d'entrée de gamme. On le mesure en phase 0. Le plan B consiste à utiliser Verovio natif (C++) via un plugin Capacitor personnalisé, si nécessaire.

### 1.2 Pile technique

| Domaine | Choix | Rôle |
|---|---|---|
| Langage | **TypeScript** (strict) | |
| Build | **Vite** | |
| UI | **React** + **Ionic React** | Composants mobiles (listes, modales, curseurs, action sheets), gestes, navigation |
| État | **Zustand** | Stores simples (bibliothèque, visionneuse, paramètres) |
| Workers | **Comlink** | Appels de fonctions vers les Web Workers |
| Import MuseScore | **webmscore** (WASM) | `.mscz`/`.mscx` → MusicXML + métadonnées + positions |
| Rendu | **Verovio** (`verovio` sur npm, build WASM) | MusicXML → SVG, transposition, timemap |
| ZIP | **fflate** | Lire les `.mscz` (miniature) et les `.mxl` |
| Coquille native | **Capacitor** (dernière version stable) | Android + iOS |
| Fichiers | `@capacitor/filesystem` | Stockage des partitions dans l'espace privé de l'application |
| Préférences | `@capacitor/preferences` | Paramètres globaux |
| Sélecteur de fichiers | `@capawesome/capacitor-file-picker` (à confirmer) | Import multi-fichiers |
| Écran allumé | `@capacitor-community/keep-awake` | |
| Orientation | `@capacitor/screen-orientation` | |
| Ouvrir avec / partage entrant | `@capacitor/app` (`appUrlOpen`) + configuration native (intent-filters Android, `CFBundleDocumentTypes` iOS) ou plugin « send-intent » | |
| i18n | **i18next** + **react-i18next** + `eslint-plugin-i18next` | **EN (langue de référence)**, puis FR et d'autres (voir §11) |
| Tests unitaires | **Vitest** | |
| Tests E2E | **Playwright** sur la version web | |
| Lint/format | ESLint + Prettier | |
| CI | GitHub Actions (web + APK Android ; iOS sur runner macOS) | |

Cibles minimales envisagées : **Android 8.0+ (API 26)**, **iOS 15+**. On les ajustera selon la version de Capacitor et la prise en charge de WASM et des Web Workers dans les WebView.

## 2. Architecture

### 2.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Thread principal (UI React/Ionic)               │
│  Écrans : Bibliothèque · Visualisation · Paramètres                  │
│  Stores : libraryStore · viewerStore · settingsStore                 │
│  Services : LibraryRepository · ImportService · RenderService ·      │
│             AutoScrollEngine · InputController (tap/swipe/pédalier)  │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ Comlink                       │ Comlink
     ┌──────────▼───────────┐       ┌───────────▼────────────┐
     │ import.worker.ts     │       │ render.worker.ts       │
     │  webmscore (WASM)    │       │  Verovio (WASM)        │
     │  chargé à la demande │       │  chargé à l'ouverture  │
     │  uniquement à        │       │  d'une partition       │
     │  l'import            │       │                        │
     └──────────┬───────────┘       └───────────┬────────────┘
                │                               │
     ┌──────────▼───────────────────────────────▼────────────┐
     │  Stockage : Filesystem (Directory.Data) + Preferences │
     └───────────────────────────────────────────────────────┘
                │
     ┌──────────▼───────────┐
     │ Capacitor (Android / │  plugins natifs : fichiers, keep-awake,
     │ iOS)                 │  orientation, ouverture de fichiers
     └──────────────────────┘
```

### 2.2 Organisation du code (proposition)

```
mscz_viewer/
├── README.md, ROADMAP.md, docs/
├── src/
│   ├── app/                  # Routage, layout, providers (i18n, thème)
│   ├── screens/
│   │   ├── library/          # LibraryScreen (onglets Partitions | Setlists), ScoreCard, ImportButton, ScoreInfoModal
│   │   ├── setlists/         # SetlistList, SetlistDetail (glisser-déposer), AddScoresModal
│   │   ├── viewer/           # ViewerScreen, ScoreCanvas, Toolbar, PartsPicker,
│   │   │                     # TransposePanel, ZoomControl, AutoScrollBar, GoToMeasure
│   │   └── settings/         # SettingsScreen, PedalKeyCapture, LicensesScreen
│   ├── core/
│   │   ├── model/            # Types : Score, Part, Timeline, ViewState, Settings
│   │   ├── storage/          # LibraryRepository, SetlistRepository, ViewStateRepository, migrations
│   │   ├── import/           # ImportService, détection de format, import.worker.ts
│   │   ├── musicxml/         # Filtrage des parties, utilitaires XML
│   │   ├── render/           # RenderService, render.worker.ts, cache SVG
│   │   ├── timeline/         # Construction et requêtes de la timeline
│   │   ├── clock/            # PlaybackClock partagée (temps partition, facteur de tempo)
│   │   ├── autoscroll/       # AutoScrollEngine (mapping temps → position)
│   │   ├── metronome/        # MetronomeEngine (Web Audio, ordonnanceur avec anticipation)
│   │   └── input/            # Gestes, zones de tap, clavier/pédalier
│   ├── ui/                   # Composants génériques, thèmes
│   └── i18n/                 # locales/en/*.json (référence), locales/fr/*.json…
├── public/
│   ├── webmscore/            # Fichiers WASM/JS de webmscore + polices
│   └── verovio/              # (si non intégré par le bundler)
├── tests/
│   ├── fixtures/scores/      # Corpus : MS 3.6, MS 4.0, 4.2, 4.4, 4.6, MusicXML…
│   ├── unit/
│   └── e2e/
├── android/                  # Généré par Capacitor
└── ios/                      # Généré par Capacitor
```

## 3. Modèle de données

### 3.1 Types principaux

```ts
type ScoreId = string; // UUID v4

interface Score {
  id: ScoreId;
  title: string;            // modifiable par l'utilisateur
  originalTitle: string;
  subtitle?: string;
  composer?: string;
  arranger?: string;
  sourceFormat: 'mscz' | 'mscx' | 'mxl' | 'musicxml';
  sourceFileName: string;
  sourceHash: string;       // SHA-256 du fichier d'origine (détection des doublons)
  importedAt: string;       // ISO 8601
  lastOpenedAt?: string;
  importerVersion: string;  // version du pipeline d'import (pour refaire l'import si besoin)
  museScoreVersion?: string;// ex. "4.4.2" (si connu)
  measures: number;
  durationSec?: number;
  initialTempoBpm?: number;
  keySignature?: number;    // nombre d'altérations, -7..+7
  timeSignature?: string;   // "4/4"
  parts: Part[];
  rehearsalMarks: { label: string; measureIndex: number }[];
  tags: string[];           // v2
}

interface Part {
  index: number;            // ordre dans la partition
  musicXmlId: string;       // identifiant <score-part id="P1">
  name: string;             // "Trompette en Sib 1"
  instrumentName?: string;
  instrumentId?: string;    // identifiant MuseScore (ex. "bb-trumpet")
  midiProgram?: number;
  staves: number;
  transposition?: { chromatic: number; diatonic: number; octave: number }; // <transpose> MusicXML
  hasTab: boolean;
  hasDrums: boolean;
}

/** Ordre de jeu réel, reprises dépliées. */
interface Timeline {
  source: 'webmscore' | 'verovio';
  events: TimelineEvent[];
  totalMs: number;
}

interface TimelineEvent {
  measureIndex: number;     // rang de la mesure dans le MusicXML (0-based)
  startMs: number;          // au tempo d'origine
  durationMs: number;
  timeSig: { beats: number; beatType: number }; // pour le métronome
  bpm: number;              // tempo en vigueur au début de la mesure (noire = 1)
  beatOffsetsMs?: number[]; // début de chaque temps si le tempo change dans la mesure
}

interface Setlist {
  id: string;
  name: string;
  date?: string;            // ISO 8601, optionnelle
  createdAt: string;
  updatedAt: string;
  items: SetlistItem[];
}

interface SetlistItem {
  id: string;               // une même partition peut apparaître plusieurs fois
  scoreId: ScoreId;
  note?: string;
  override?: Partial<Pick<ScoreViewState,
    'selectedParts' | 'transposeSemitones' | 'transposeOctave' | 'concertPitch'>>;
}

/** Réglages mémorisés pour chaque partition. */
interface ScoreViewState {
  scoreId: ScoreId;
  selectedParts: string[];  // musicXmlId[] ; vide = toutes
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
  accidentalPreference: 'auto' | 'sharps' | 'flats';
  zoom: number | 'fit-width';
  layoutMode: 'pages' | 'continuous';
  lastPage: number;
  lastMeasureIndex?: number;
  tempoFactor: number;      // 0.5 – 1.5
  metronomeEnabled: boolean;
}
```

### 3.2 Stockage sur l'appareil

```
Directory.Data/
├── library.json                    # { schemaVersion, scores: Score[] }
├── viewstates.json                 # { [scoreId]: ScoreViewState }
├── setlists.json                   # { schemaVersion, setlists: Setlist[] }
├── scores/<scoreId>/
│   ├── original.mscz               # fichier d'origine (conservé pour refaire l'import)
│   ├── score.musicxml              # MusicXML complet (sortie de l'import)
│   ├── timeline.json
│   └── thumbnail.png
└── cache/render/<scoreId>/<renderKey>/page-<n>.svg   # cache SVG (vidable)
```

- `renderKey` = hash des paramètres de rendu : parties, transposition, zoom, taille d'écran, police, thème de mise en page.
- Les paramètres globaux sont dans `@capacitor/preferences` (clé `settings`, objet JSON versionné).
- Les écritures d'index sont **atomiques** : on écrit dans un fichier temporaire, puis on le renomme.
- `schemaVersion` et des **migrations** sont prévus dès le MVP.
- Si l'index dépasse quelques centaines de partitions ou si la recherche devient lente, on passe à SQLite (`@capacitor-community/sqlite`) derrière la même interface `LibraryRepository`.
- iOS : on pourra exposer un dossier « Boîte de réception » dans l'application Fichiers (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`) pour déposer des `.mscz` (v2).

## 4. Pipeline d'import

Exécuté dans `import.worker.ts`. webmscore n'est chargé que dans ce worker, et seulement quand on importe.

1. **Lecture** des octets du fichier (sélecteur ou « Ouvrir avec »).
2. **Empreinte** SHA-256 (WebCrypto `crypto.subtle.digest`) → détection des doublons.
3. **Détection du format** : extension + signature (`PK` = ZIP). Pour un ZIP, on regarde le contenu : `.mscx` → mscz ; `META-INF/container.xml` qui pointe un `.musicxml` → mxl.
4. **Si mscz/mscx** :
   1. `await WebMscore.ready` puis `WebMscore.load('mscz', data, fonts)`.
   2. `metadata()` → titre, compositeur, parties, tempo, mesures, version de MuseScore.
   3. `saveXml()` → **MusicXML complet** (toutes les parties).
   4. `savePositions(false)` ou `measurePositions()` → **timeline** des mesures dans l'ordre de jeu, reprises dépliées (*à valider en phase 0*). On l'enrichit avec la **métrique** et le **tempo** de chaque mesure, lus dans le MusicXML (`<time>`, `<sound tempo>`, `<metronome>`), pour le métronome.
   5. Miniature : on extrait directement `Thumbnails/thumbnail.png` de l'archive avec fflate (rapide). Sinon `savePng(0)`.
   6. `destroy()` pour libérer la mémoire du worker.
5. **Si MusicXML/MXL** : on analyse le XML directement (titre, `<part-list>`, tempo). La timeline sera calculée par Verovio (`renderToTimemap({ includeMeasures: true })`) à la première ouverture, puis mise en cache.
6. **Post-traitement du MusicXML** : extraction des marques de répétition (`<rehearsal>`) et des transpositions de parties (`<transpose>`).
7. **Écriture** des fichiers puis mise à jour de l'index.
8. **Erreurs** : chaque étape lève une erreur typée (`UnsupportedFormat`, `UnsupportedMuseScoreVersion`, `CorruptedFile`, `OutOfMemory`…). L'interface affiche un message adapté.

Objectif de performance : l'import d'une partition typique (environ 10 parties, 150 mesures) prend **moins de 10 s** sur un téléphone milieu de gamme récent. L'initialisation de webmscore est comprise dans ce temps.

## 5. Pipeline de rendu

Exécuté dans `render.worker.ts` (Verovio WASM). Verovio reste chargé tant qu'une partition est ouverte.

1. **Filtrage des parties** (`core/musicxml`) : DOMParser dans le worker (ou un parseur XML léger si `DOMParser` manque dans le worker). On supprime les `<score-part>` et `<part>` non sélectionnés, ainsi que les `<part-group>` devenus vides. Le résultat est mis en cache en mémoire par combinaison de parties.
2. **Options Verovio** calculées à partir de l'écran et du ViewState :
   - `pageWidth` / `pageHeight` : dimensions de la zone d'affichage converties en unités Verovio, en tenant compte de `scale` (le zoom) ;
   - `scale` : zoom ;
   - `breaks: 'auto'` : mise en page **toujours** adaptée à l'écran. Les sauts d'origine sont ignorés (ADR-002) ;
   - `adjustPageHeight: true` en mode Continu (une seule « page » longue, ou des pages enchaînées sans marge) ;
   - `transpose` : intervalle ou tonalité cible (*syntaxe exacte à confirmer dans la doc Verovio, chapitre Transposition*) ; `transposeToSoundingPitch` pour la bascule ut / hauteur écrite ;
   - `font` : Leipzig, Bravura, ou une police ajoutée via `fontAddCustom` ;
   - options d'affichage : numéros de mesure, en-tête/pied de page, silences multi-mesures (*à vérifier : prise en charge de `<multiple-rest>` à l'import MusicXML et option de regroupement*).
3. `loadData(xml)` → `getPageCount()`.
4. **Rendu paresseux** : `renderToSVG(n)` pour la page courante, puis **pré-rendu** de n+1 et n−1 en arrière-plan. Cache LRU en mémoire (environ 10 pages) et cache disque optionnel.
5. **Index des mesures** : après chaque rendu de page, on relève l'ordre des `g.measure` (identifiants) → table `measureIndex ↔ { page, id }`. Les rectangles exacts (bbox) sont lus côté UI dans le DOM SVG.
6. **Relayout** (`redoLayout()`) déclenché quand : l'orientation ou la taille d'écran change, le zoom est validé (fin du pincement + 300 ms d'anti-rebond), ou un paramètre d'affichage change. Changer les parties ou la transposition demande un nouveau `loadData`.

**Thèmes** : le SVG est inséré dans le DOM (pas en `<img>`), ce qui permet de le styler en CSS (couleur de trait via `currentColor` si Verovio le produit, sinon `fill`/`stroke` surchargés). Le mode sombre se fait par feuille de style. En dernier recours : `filter: invert(1) hue-rotate(180deg)`.

**Objectifs de performance** (téléphone milieu de gamme) :
- ouverture d'une partition déjà importée → première page affichée en **moins de 1,5 s** ;
- tournage de page avec page pré-rendue en **moins de 100 ms** ;
- relayout après zoom en **moins de 1 s** pour une partie seule de 200 mesures.

## 6. Défilement automatique et métronome

### 6.1 Timeline

- **Source principale** : webmscore à l'import. Les positions MuseScore donnent l'ordre de jeu réel, avec reprises, voltas, D.C./D.S./Coda et changements de tempo.
- **Source de repli** : la timemap de Verovio (`renderToTimemap({ includeMeasures: true })`) pour les fichiers MusicXML. Le dépliage des reprises par Verovio est à vérifier. Sinon, on implémente nous-mêmes le dépliage des reprises MusicXML (`<repeat>`, `<ending>`, `<sound dacapo/dalsegno/coda/fine>`).
- **Correspondance des mesures** : `measureIndex` = rang de la mesure dans le MusicXML (0-based). L'export de webmscore garde l'ordre des mesures. Attention aux **anacrouses** et aux **mesures numérotées de façon irrégulière** : on se base toujours sur le rang, jamais sur le numéro affiché.

### 6.2 Horloge partagée (`PlaybackClock`)

Le défilement automatique et le métronome lisent la **même horloge**, ce qui garantit qu'ils restent synchronisés :
- temps partition = `(maintenant − départ) × tempoFactor + offset`. Changer le facteur de tempo recalcule l'offset, sans saut ;
- source de temps : `AudioContext.currentTime` quand le métronome est actif (précis, et c'est l'horloge qui produit le son), sinon `performance.now()`.

### 6.3 Moteur de défilement (`AutoScrollEngine`)

```
t_partition = (now - t_départ) × tempoFactor + t_offset
événement courant = recherche dichotomique dans timeline.events
progression dans la mesure = (t_partition - start) / duration
position cible = interpolation entre la bbox de la mesure courante et celle de la suivante
```

- L'horloge est `requestAnimationFrame` + `performance.now()`. Changer le tempo pendant la lecture recalcule `t_offset`, ce qui évite les sauts.
- **Mode Continu** : `scrollTop` cible = y du système courant − hauteur de lecture, avec un lissage critique-amorti (pas de saccades au changement de système).
- **Mode Pages** : on tourne la page quand la mesure courante (+ l'avance de N mesures) se trouve sur la page suivante. En mode demi-page, on déclenche le demi-tournage quand la lecture passe la moitié de la page.
- **Saut arrière** (reprise) : si la mesure suivante est sur une page précédente, on y retourne immédiatement.
- **Décompte** : N mesures dont la métrique et le tempo sont ceux de la première mesure jouée. Le clic passe par le métronome (voir 6.4).
- **Pause** au toucher, au pédalier, ou quand l'application passe en arrière-plan.

### 6.4 Métronome (`MetronomeEngine`)

Il n'y a **aucune lecture audio de la partition** (ADR-010). Le métronome est le seul son de l'application.

- **Génération du son** : Web Audio. Un `OscillatorNode` court (environ 30 ms, enveloppe via `GainNode`) avec une fréquence plus aiguë pour l'accent du premier temps. Aucun fichier audio.
- **Ordonnancement précis** : la technique « lookahead scheduler » (minuterie toutes les ~25 ms qui programme à l'avance les clics des ~100 ms suivantes avec `osc.start(t)`). On ne déclenche jamais de son directement depuis un `setTimeout`, qui n'est pas assez précis.
- **Temps des clics** :
  - mode synchronisé : calculés à partir de la timeline (`startMs`, `timeSig`, `beatOffsetsMs`) divisée par le facteur de tempo. Les reprises sont donc gérées naturellement. Pour les métriques composées (6/8, 9/8, 12/8), on bat à la noire pointée par défaut, ce qui est réglable plus tard ;
  - mode seul : à partir du `bpm` et de la `timeSig` de la mesure affichée, ou d'un BPM saisi par l'utilisateur.
- **Indicateur visuel** : déclenché par `requestAnimationFrame`, en comparant `AudioContext.currentTime` aux temps programmés. Le flash est ainsi aligné avec le son.
- **Contraintes plateforme** : l'`AudioContext` doit être créé ou repris après un geste de l'utilisateur (tap sur ▶ ou sur le bouton métronome). iOS (phase 3) : le bouton silencieux coupe Web Audio, ce qui sera signalé dans l'interface ou contourné par une session audio native.
- **Latence** : sur Android, la latence de sortie (`AudioContext.outputLatency` / `baseLatency`) est compensée en avançant les clics, avec un réglage manuel de calibration (v2).

## 7. Entrées utilisateur

- **Gestes** (Ionic Gesture / pointer events) : tap par zones, balayage horizontal, pincement (CSS `transform: scale` pendant le geste, puis relayout Verovio à la fin), défilement natif en mode Continu.
- **Clavier / pédalier** : écouteur `keydown` global sur l'écran Visualisation. La table de correspondance est configurable (`ArrowRight`, `ArrowDown`, `PageDown`, `Space`, `Enter` → suivant ; `ArrowLeft`, `ArrowUp`, `PageUp` → précédent). Un écran « appuyez sur votre pédale » capture le `code` de la touche. *À tester* : réception des touches d'un clavier Bluetooth dans la WebView Android/iOS quand aucun champ n'a le focus, et masquage du clavier virtuel.
- **Actions du pédalier** : page suivante, page précédente, lecture/pause, métronome marche/arrêt, morceau suivant (setlist). Chaque action peut être associée à une touche, ou à un appui long.
- **Mode verrouillé** : seuls les tournages de page (zones + pédalier) restent actifs.

## 8. Intégration native

| Besoin | Android | iOS |
|---|---|---|
| Ouvrir avec / partager vers | `intent-filter` `ACTION_VIEW` / `ACTION_SEND` (MIME `application/x-musescore`, `application/vnd.recordare.musicxml+xml`, `application/vnd.recordare.musicxml`, `application/octet-stream` + motif d'extension) | `CFBundleDocumentTypes` + `UTImportedTypeDeclarations` (UTI pour `.mscz`, `.mscx`, `.mxl`, `.musicxml`) |
| Écran allumé | `FLAG_KEEP_SCREEN_ON` (plugin) | `isIdleTimerDisabled` (plugin) |
| Réseau | **Retirer la permission `INTERNET`** si possible (l'application est 100 % hors ligne ; Capacitor sert les fichiers en local) | Pas de réseau nécessaire |
| Stockage | Stockage interne de l'application | `Library/` ou `Documents/` |

## 9. Setlists

- Stockage : `setlists.json` via `SetlistRepository`, avec des écritures atomiques et un `schemaVersion`.
- Les entrées référencent les partitions par `scoreId`. Quand on supprime une partition, ses entrées sont retirées des setlists, après un avertissement dans l'interface.
- **Ouverture en mode setlist** : la route de l'écran Visualisation reçoit `setlistId` + `itemId`. On calcule les réglages effectifs ainsi : défauts globaux ← réglages de la partition ← surcharge de l'entrée. Les changements faits pendant la lecture en mode setlist sont enregistrés **dans la surcharge de l'entrée** s'ils portent sur les instruments ou la transposition, et dans les réglages de la partition sinon (zoom, page…).
- **Pré-chargement** : pendant la lecture d'un morceau, le MusicXML filtré du morceau suivant est préparé en arrière-plan. La première page du suivant s'affiche ainsi en moins de 500 ms.
- Durée totale estimée : somme des `Timeline.totalMs`.

## 10. Fonctionnement hors ligne

- Tous les fichiers (JS, WASM webmscore/Verovio, polices SMuFL et texte) sont **embarqués dans l'application**. Aucun CDN.
- Pas de télémétrie, pas d'analytics, pas d'appel réseau.
- Version web/PWA (développement, bonus) : service worker (Workbox) pour mettre en cache tous les fichiers.

## 11. Internationalisation (ADR-009)

- **Anglais = langue de référence** : `src/i18n/locales/en/` fait foi, les autres langues sont des traductions.
- Bibliothèques : `i18next` + `react-i18next`. Un fichier JSON par espace de noms (`library`, `viewer`, `settings`, `setlists`, `errors`, `music`).
- **Aucune chaîne visible en dur** dans le code : la règle `eslint-plugin-i18next` (`no-literal-string`) bloque la CI.
- Pluriels et variables avec le format ICU d'i18next (`{{count}} scores`).
- Dates, nombres et durées formatés via `Intl.DateTimeFormat`, `Intl.NumberFormat` et `Intl.RelativeTimeFormat`, selon la langue.
- **Vocabulaire musical** dans l'espace de noms `music` : noms de notes et de tonalités, avec un réglage « notation » indépendant de la langue (C D E / Do Ré Mi / C D E H). Les noms d'instruments viennent du fichier et ne sont pas traduits.
- Langue : celle du système si elle est disponible, sinon l'anglais. Choix manuel possible dans les paramètres.
- CSS en propriétés logiques (`margin-inline-start`, `padding-inline`…) pour rester compatible avec les langues de droite à gauche.
- Les libellés doivent supporter environ +40 % de longueur (l'allemand et le français sont plus longs que l'anglais). On évite les largeurs fixes.
- Plus tard, on pourra brancher une plateforme de traduction collaborative (Weblate, compatible F-Droid ou Crowdin).

## 12. Taille et ressources

| Élément | Taille estimée |
|---|---|
| webmscore (WASM + JS + polices) | environ 12–15 Mo |
| Verovio WASM | quelques Mo (à mesurer) |
| Application (JS/CSS) | moins de 2 Mo |
| **Total de l'application installée** | **environ 25–35 Mo** (à confirmer) |

Mémoire : webmscore ne doit être chargé **qu'à l'import** et libéré ensuite (on termine le worker). Il faut surveiller les gros conducteurs (30 parties et plus) sur les appareils modestes.

## 13. Qualité et tests

- **Corpus de test** (`tests/fixtures/scores`) : fichiers libres de droits (domaine public ou créés pour le projet) couvrant **MuseScore 3.0, 3.2, 3.5, 3.6, 4.0, 4.2, 4.4 et la dernière version** (fichiers réels fournis par le porteur du projet, en plus), plus du MusicXML d'autres logiciels. Il doit contenir : reprises et voltas, D.S. al Coda, changements de tempo et de mesure, anacrouse, instruments transpositeurs, piano (2 portées), batterie, tablature, paroles, grilles d'accords, silences multi-mesures, marques de répétition.
- **Tests unitaires** : filtrage MusicXML, timeline (dépliage des reprises, recherche temps → mesure), calcul des temps du métronome (métriques simples et composées, changements de tempo, facteur de tempo), réglages effectifs des setlists, calcul des options Verovio, migrations du stockage, correspondance des touches, présence de toutes les clés i18n.
- **Tests de non-régression visuels** : SVG de référence pour chaque fichier du corpus (comparaison d'images avec Playwright).
- **Tests E2E** (Playwright, version web) : importer → ouvrir → choisir une partie → transposer → défilement automatique.
- **Tests sur appareils** (manuels, avec une checklist) : Android milieu de gamme, tablette Android, iPhone, iPad. On teste le pédalier Bluetooth, la rotation et l'ouverture depuis une autre application.

## 14. Licence et conformité

- Licence de l'application : **GPL-3.0-or-later** (à cause de webmscore). Voir [DECISIONS.md](DECISIONS.md), ADR-003.
- Écran « Licences » dans l'application : texte de la GPL et des licences tierces (LGPL de Verovio, OFL des polices, MIT/BSD des dépendances JS), générées automatiquement à la compilation (`license-checker` ou un plugin Vite).
- Lien vers le dépôt des sources dans « À propos ».
- Ne pas utiliser le nom ni le logo « MuseScore » dans le nom, l'icône ou la fiche store. Formulation autorisée : « Lit les fichiers .mscz ».
