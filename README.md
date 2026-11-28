# Pupitre

**Lecteur de partitions MuseScore pour musiciens en répétition et en concert**, sur **Android** et sur **iPhone** (application web installable, aussi utilisable dans tout navigateur), **100 % hors ligne**. Interface en anglais et en français (selon la langue de l'appareil, ou au choix dans les paramètres).

> 🟢 **Statut : phase 2 terminée (2026-11-25).** L'application Android fonctionne (APK de debug produit par la CI) et a été essayée sur un vrai téléphone ([retours](docs/TESTS_APPAREIL.md)). Prochaine étape : phase 3 (traduction française, finitions, publication). Voir la [roadmap](ROADMAP.md).

## Ce que fait l'application

- 📂 **Importer** des fichiers `.mscz` / `.mscx` (**MuseScore 2.x, 3.x et 4.x** ; testés : 2.1, 3.6, 4.5, 4.6) et `.mxl` / `.musicxml` / `.xml`, depuis le sélecteur de fichiers (multi-sélection), « Ouvrir avec… » ou « Partager vers » (mail, messagerie, Drive) sur Android. Doublons détectés, recherche, tri, renommage, informations.
- 🎼 **Afficher** la partition (lecture seule), toujours **remise en page pour l'écran** du téléphone ou de la tablette.
- 🎷 **Choisir les instruments** à afficher (un seul, plusieurs, ou le conducteur complet), avec silences multi-mesures regroupés et profil **« My instrument »** qui présélectionne sa partie.
- 📄 **Deux modes d'affichage** : **Pages** (balayage, zones de tap, boutons, clavier/pédalier, option **demi-page**) ou **Continu** (un seul rouleau vertical).
- 🔍 **Zoomer** (pincement ou boutons, nouvelle mise en page). Le zoom est mémorisé pour chaque partition.
- ♯♭ **Transposer** (demi-tons, octave, préréglages Si♭/Mi♭/Fa, hauteur réelle, choix ♯/♭ pour les tonalités enharmoniques).
- 𝄢 **Changer la clé** d'un instrument : clé de sol, de sol 8 en bas, de fa, d'ut 3e ou 4e ligne (ex. trombone ou tuba lu en clé de sol), avec le préréglage brass band **« Si♭ clé de sol »** (clé de sol + neuvième majeure).
- ▶️ **Faire défiler automatiquement** au tempo de la partition, avec les changements de tempo et les **reprises**, un facteur de tempo (50–150 %), un décompte et le surlignage de la mesure en cours ; départ depuis la page affichée, une mesure choisie (« aller à ») ou **touchée** (appui long).
- 🥁 **Métronome optionnel** (clic + indicateur visuel), calé sur le tempo de la partition, avec ou sans défilement (« métronome seul ») ; avec le son, il est joué par le synthétiseur, exactement en même temps que les notes, et réglé dans le mixeur (volume par partition, jamais coupé par un solo).
- 🔊 **Entendre la partition** pendant le défilement (instruments General MIDI synthétisés, hors ligne), parfaitement calée sur le défilement (tempo 50–150 %, reprises, décompte, départ depuis une mesure), avec un **mixeur** : volume, muet et solo par partie, volume général, raccourcis « Tous / Moi seul / Sans moi » (profil « My instrument ») ; mémorisé par partition et par morceau de setlist.
- 🧭 **Aller à une mesure** ou à une **marque de répétition** ; **mode verrouillé** contre les touchers accidentels.
- 🦶 **Pédalier Bluetooth / clavier** : touches configurables pour page suivante/précédente, lecture/pause, métronome, morceau suivant/précédent.
- 📋 **Setlists** : préparer le programme d'une répétition ou d'un concert (instruments, clés et transposition par morceau), puis enchaîner les morceaux ; le morceau suivant est pré-chargé.
- 🌙 Thèmes de l'application (système/clair/sombre) et de la partition (clair, sépia, sombre, contraste élevé) ; écran toujours allumé.

## Écrans

1. **Bibliothèque** : onglets **Scores** (liste, recherche, tri, bouton **Import**) et **Setlists**.
2. **Visualisation** : la partition en plein écran, avec instruments, transposition, zoom, mode Pages/Continu, verrouillage, défilement automatique, métronome et « aller à ».
3. **Paramètres** : profil « My instrument », affichage, navigation, pédalier, défilement automatique et métronome, système, à propos et licences.

## Choix techniques (résumé)

| Brique | Choix | Pourquoi |
|---|---|---|
| Multiplateforme | **Capacitor 8** + **Ionic React 9** + **React 19** + **TypeScript 6** + Vite 8 | Les moteurs de partition sont en WebAssembly : une seule pile technique, testable dans le navigateur |
| Lecture des fichiers | **[webmscore](https://github.com/LibreScore/webmscore)** (MuseScore 4.0 compilé en WASM, GPL) | Seul moteur libre qui lit fidèlement le format MuseScore. Utilisé **uniquement à l'import** (y compris pour le MusicXML) pour produire MusicXML, métadonnées et timeline |
| Rendu | **[Verovio](https://www.verovio.org)** 6.4 (LGPL-3.0), dans un Web Worker | Mise en page adaptée à l'écran, transposition, projet très actif |
| Stockage | Fichiers locaux + index JSON ; cache disque des pages rendues (LRU) | Simple, hors ligne ; réouverture rapide des gros conducteurs |
| Défilement, métronome et son | Horloge commune sur Web Audio ; son de la partition : MIDI produit à l'import (webmscore) joué par **[spessasynth](https://github.com/spessasus/spessasynth_lib)** (AudioWorklet) avec la banque **FluidR3Mono GM** (14,6 Mo), chargés seulement si on active le son | Précis, toujours synchronisés, hors ligne |
| i18n | i18next + react-i18next, anglais de référence, français | Traductions faciles à ajouter ; notation des notes C D E / Do Ré Mi / C D E H |

Détails et justification : voir la documentation ci-dessous.

## Documentation

| Document | Contenu |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Phases, état d'avancement, risques |
| [docs/SPECIFICATIONS_FONCTIONNELLES.md](docs/SPECIFICATIONS_FONCTIONNELLES.md) | Écrans, fonctions, ergonomie, paramètres, récits utilisateurs (avec l'état réel de chaque fonction) |
| [docs/SPECIFICATIONS_TECHNIQUES.md](docs/SPECIFICATIONS_TECHNIQUES.md) | Architecture, modèle de données, pipelines d'import, de rendu et de défilement, tests, CI |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Décisions d'architecture (ADR), réponses de cadrage et questions encore ouvertes |
| [docs/TESTS_APPAREIL.md](docs/TESTS_APPAREIL.md) | Retours de test sur un vrai téléphone Android et ce qui reste à essayer |
| [docs/ETUDE_RENDU_PARTITIONS.md](docs/ETUDE_RENDU_PARTITIONS.md) | État de l'art des bibliothèques de rendu, réutilisation de MuseScore, licences |
| [docs/spikes/PHASE0_RESULTATS.md](docs/spikes/PHASE0_RESULTATS.md) | Résultats des validations techniques de la phase 0 |
| [spikes/README.md](spikes/README.md) | Scripts jetables de la phase 0 et banc de test web |

## Dépendances

Merci aux projets open source sur lesquels Pupitre repose. Les licences sont aussi listées dans l'application (Paramètres → À propos → Licences open source).

### Moteurs de partition

| Projet | Rôle | Licence |
|---|---|---|
| [webmscore](https://github.com/LibreScore/webmscore) (fork de [MuseScore](https://github.com/musescore/MuseScore)) | Lecture des `.mscz`/`.mscx`/MusicXML à l'import (MuseScore compilé en WebAssembly) | GPL-3.0 |
| [Verovio](https://github.com/rism-digital/verovio) | Rendu des partitions en SVG, transposition, mise en page adaptée à l'écran | LGPL-3.0 |
| [Leipzig](https://github.com/rism-digital/leipzig) | Police musicale SMuFL utilisée par Verovio | SIL OFL 1.1 |

### Son de la partition (ADR-026)

| Projet | Rôle | Licence |
|---|---|---|
| [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) / [spessasynth_core](https://github.com/spessasus/spessasynth_core) | Synthétiseur SoundFont (SF2/SF3) dans un AudioWorklet | Apache-2.0 |
| [FluidR3Mono_GM.sf3](https://github.com/musescore/MuseScore/tree/v2.3.2/share/sound) (FluidR3 de Frank Wen, version mono de Michael Cowgill, distribuée par MuseScore) | Banque de sons General MIDI (14,6 Mo, téléchargée par `scripts/fetch-soundfont.mjs` ; licence dans `public/soundfonts/FluidR3Mono_License.md`) | MIT |

### Application

| Projet | Rôle | Licence |
|---|---|---|
| [Capacitor](https://github.com/ionic-team/capacitor) (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`) | Coquille native Android | MIT |
| [Capacitor plugins](https://github.com/ionic-team/capacitor-plugins) (`@capacitor/app`, `@capacitor/preferences`, `@capacitor/screen-orientation`) | Cycle de vie de l'appli, « Ouvrir avec », préférences, verrouillage de l'orientation | MIT |
| [Capacitor Filesystem](https://github.com/ionic-team/capacitor-filesystem) | Stockage des partitions sur l'appareil | MIT |
| [Capawesome File Picker](https://github.com/capawesome-team/capacitor-plugins) | Sélecteur de fichiers natif | MIT |
| [Keep Awake](https://github.com/capacitor-community/keep-awake) | Écran toujours allumé | MIT |
| [Capacitor Share Target](https://github.com/Cap-go/capacitor-share-target) (Capgo) | « Partager vers » Pupitre depuis une autre application | MPL-2.0 |
| [Capacitor Screen Orientation](https://github.com/ionic-team/capacitor-screen-orientation) | Verrouillage de l'orientation | MIT |
| [Capgo Share Target](https://github.com/Cap-go/capacitor-share-target) | « Partager vers » (réception de fichiers partagés) | MPL-2.0 |
| [Ionic Framework](https://github.com/ionic-team/ionic-framework) (`@ionic/react`, `@ionic/react-router`) | Composants d'interface mobile | MIT |
| [Ionicons](https://github.com/ionic-team/ionicons) | Icônes | MIT |
| [React](https://github.com/react/react) (`react`, `react-dom`) | Interface | MIT |
| [React Router](https://github.com/remix-run/react-router) | Navigation entre écrans | MIT |
| [i18next](https://github.com/i18next/i18next) / [react-i18next](https://github.com/i18next/react-i18next) | Traductions (anglais, français) | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | État de l'application | MIT |
| [Comlink](https://github.com/GoogleChromeLabs/comlink) | Communication avec le worker de rendu | Apache-2.0 |
| [fflate](https://github.com/101arrowz/fflate) | Lecture des archives `.mscz`/`.mxl` (ZIP) | MIT |

### Outils de développement

| Projet | Rôle | Licence |
|---|---|---|
| [Vite](https://github.com/vitejs/vite) / [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | Serveur de développement et build | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Langage | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest) | Tests unitaires | MIT |
| [Playwright](https://github.com/microsoft/playwright) | Tests de bout en bout (Chromium headless) | Apache-2.0 |
| [axe-core](https://github.com/dequelabs/axe-core) | Contrôle d'accessibilité automatique (e2e `accessibility.mjs`) | MPL-2.0 |
| [ESLint](https://github.com/eslint/eslint), [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint), [eslint-plugin-react-hooks](https://github.com/facebook/react), [eslint-plugin-i18next](https://github.com/edvardchen/eslint-plugin-i18next), [globals](https://github.com/sindresorhus/globals) | Analyse du code (dont la règle « pas de texte en dur ») | MIT / ISC |
| [@xmldom/xmldom](https://github.com/xmldom/xmldom), [jsdom](https://github.com/jsdom/jsdom) | DOM XML/HTML pour les tests sous Node | MIT |
| [axe-core](https://github.com/dequelabs/axe-core) | Tests d'accessibilité automatiques | MPL-2.0 |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) (`@types/*`) | Types TypeScript | MIT |

## Licence

**GPL-3.0-or-later**, imposée par l'utilisation de webmscore (dérivé de MuseScore, GPL). Voir [ADR-003](docs/DECISIONS.md).

*MuseScore est une marque de ses propriétaires respectifs. Ce projet n'est ni affilié à MuseScore ni approuvé par MuseScore.*

## Installer sur iPhone (application web)

Pupitre est aussi publié comme **application web installable** (PWA, [ADR-027](docs/DECISIONS.md)) : **https://artiskongit.github.io/mscz_viewer/**. Elle fonctionne **hors ligne** une fois installée, et dans tout navigateur récent (ordinateur, tablette, Android).

1. Sur l'iPhone, ouvrir **https://artiskongit.github.io/mscz_viewer/** dans **Safari** (iOS 16.4 ou plus récent conseillé).
2. Toucher **Partager** (carré avec une flèche), puis **« Sur l'écran d'accueil »**, puis **Ajouter**.
3. Ouvrir **Pupitre depuis l'écran d'accueil**, **en ligne** (Wi-Fi conseillé) : l'application télécharge tout ce qu'il lui faut pour fonctionner sans réseau (≈ 44 Mo : moteur d'import, rendu, banque de sons). Suivi dans **Paramètres → Stockage → Utilisation hors ligne** : attendre **« Prêt »** avant de partir en répétition.
4. Importer les partitions avec le bouton **+** (application **Fichiers** : iCloud Drive, « Sur mon iPhone », pièces jointes enregistrées…).

À savoir : l'application installée a **son propre stockage**, séparé de Safari (importer les partitions depuis l'application de l'écran d'accueil). « Ouvrir avec » / « Partager vers » et le verrouillage de l'orientation n'existent que dans l'application Android. Les nouvelles versions se téléchargent toutes seules ; un message **« Nouvelle version disponible — Recharger »** les applique.

Sur un ordinateur ou un téléphone Android, Chrome et Edge proposent aussi d'**installer** l'application (icône dans la barre d'adresse ou menu « Installer l'application »).

## Installer l'APK sur un téléphone

**Le plus simple :** télécharger le fichier `pupitre-vX.Y.Z.apk` de la dernière version dans les [**Releases**](https://github.com/ArtiskOnGit/mscz_viewer/releases/latest), directement depuis le téléphone, puis l'ouvrir (autoriser l'installation d'applications depuis cette source).

Les APK sont signés avec une **clé fixe** (secret `ANDROID_DEBUG_KEYSTORE_B64`, ADR-016) : une nouvelle version s'installe par-dessus la précédente sans perdre les partitions. Depuis la **v0.7.1** la signature est réellement fixe (empreinte `439dc7dd…`, affichée dans le journal de la CI) : en venant d'une version antérieure, il faut désinstaller **une dernière fois**. Ce sont encore des versions de test (signature « debug ») ; la signature de publication pour les stores viendra en phase 3.

### Publier une nouvelle version

```bash
npm version 0.3.0 --no-git-tag-version   # met à jour package.json
git commit -am "Release 0.3.0" && git tag v0.3.0 && git push && git push --tags
```

Le workflow `.github/workflows/release.yml` (déclenché par un tag `v*`) lance lint et tests, compile l'APK (versionName = tag, versionCode = numéro de build) et crée la release GitHub avec `pupitre-v0.3.0.apk` en pièce jointe. Le même tag publie l'application web sur GitHub Pages (`.github/workflows/pages.yml`, aussi lançable à la main depuis l'onglet Actions ; prérequis : Settings → Pages → Source « GitHub Actions »).

### APK de développement

À chaque push sur `main`, la CI (`.github/workflows/ci.yml`) lance lint, typecheck, tests et build web, puis produit aussi un APK (artefact `pupitre-debug-apk`, conservé 14 jours) : `gh run download --name pupitre-debug-apk`.

## Développement

Prérequis : Node.js ≥ 22 (la CI utilise Node 24). Le SDK Android n'est **pas** nécessaire en local : l'APK est compilé par la CI (ADR-015). Pour compiler soi-même : JDK 21 + Android SDK (Android Studio), puis `npm run android`.

```bash
npm install            # copie aussi les fichiers de webmscore dans public/ (scripts/copy-webmscore.mjs)
                       # et télécharge la banque de sons dans public/soundfonts/ (scripts/fetch-soundfont.mjs ;
                       # hors ligne : SOUNDFONT_FILE=/chemin/FluidR3Mono_GM.sf3 node scripts/fetch-soundfont.mjs)
npm run dev            # application dans le navigateur (http://localhost:5173)
npm test               # tests unitaires (Vitest)
npm run lint           # ESLint (dont la règle « pas de texte en dur », ADR-009)
npm run typecheck      # tsc -b
npm run build          # build web dans dist/ (application Android, base /)
npm run build:pwa      # application web installable dans dist-pwa/ (base /mscz_viewer/, service worker, manifeste)
npm run preview:pwa    # la servir en local : http://localhost:4173/mscz_viewer/
npm run android        # build + synchronisation Capacitor + ouverture dans Android Studio
```

Tests de bout en bout (Chromium headless de Playwright, émulation Pixel 7 ; partitions de `test-scores/` requises, `npx playwright install chromium` la première fois). Chaque script lance son propre serveur Vite ; les scripts récents sortent avec le code 1 si une vérification échoue. Au tout premier lancement, Vite peut recharger la page (« Outdated Optimize Dep ») : relancer une fois.

```bash
node e2e/smoke.mjs "$PWD"                    # les 3 écrans s'affichent sans erreur
node e2e/library.mjs "$PWD" /tmp/shots       # import du corpus, doublons, persistance
node e2e/viewer.mjs "$PWD" /tmp/shots        # pages, tap, parties, zoom, rechargement
node e2e/continuous.mjs "$PWD" /tmp/shots    # mode Continu : rouleau, pédalier, zoom, aller à, défilement auto
node e2e/navigation.mjs "$PWD" /tmp/shots    # aller à, verrouillage, touches du pédalier, demi-page, métronome seul
node e2e/playback.mjs "$PWD" /tmp/shots      # défilement automatique + métronome
node e2e/transpose.mjs "$PWD" /tmp/shots     # transposition, préférence ♯/♭
node e2e/clefs.mjs "$PWD" /tmp/shots [--webkit]  # clé du trombone : sol, sol 8vb, retour, rechargement, préréglage Si♭ clé de sol
node e2e/setlists.mjs "$PWD" /tmp/shots      # setlists, morceau suivant, pré-chargement
node e2e/profile.mjs "$PWD" /tmp/shots       # profil « My instrument »
node e2e/settings.mjs "$PWD" /tmp/shots      # couleurs de partition
node e2e/i18n-fr.mjs "$PWD" /tmp/shots       # interface en français, langue, notation des notes, débordements
node e2e/display-settings.mjs "$PWD" /tmp/shots  # police, numéros de mesure, titre, zones de tap, animation, métronome par défaut
node e2e/accessibility.mjs "$PWD" /tmp/shots [fr]  # axe-core (WCAG 2.1 AA) clair + sombre, cibles ≥ 48 px, noms des boutons
node e2e/audio.mjs "$PWD" /tmp/shots        # son de la partition : chargement à la demande, mixeur, niveau de sortie, pause
node e2e/metronome-sync.mjs "$PWD" /tmp/shots  # son activé : sortie du synthétiseur enregistrée, écart clic du métronome / note < 5 ms, ligne Métronome du mixeur
node e2e/audio-stay-with-me.mjs "$PWD" /tmp/shots  # test-scores/Stay_With_Me.mscz (ignoré s'il manque) : décompte sur une levée, pas de voix
                                             # ni de note pendante, glissandos (pitch bend recentré), solo trompette = sousaphone muet
node e2e/pickbar.mjs "$PWD" /tmp/shots      # appui long sur une mesure
node e2e/performance.mjs "$PWD" /tmp/shots  # temps d'ouverture, cache de rendu, workers
node e2e/render-race.mjs "$PWD" /tmp/shots  # gros conducteur (test-scores/Motorcrypt.mscz, ignoré s'il manque) : zoom / rotation
                                             # A → B → A, page 37 jamais blanche, erreur de dessin = message + Réessayer ; Chromium + WebKit iPhone
node e2e/pwa.mjs "$PWD" /tmp/shots          # application web : build, manifeste, service worker, HORS LIGNE (import, rendu, son), mise à jour ;
                                             # Chromium + WebKit profil iPhone si installé (npx playwright install webkit)
```

| Dossier | Contenu |
|---|---|
| `src/app/` | Coquille de l'application, routes, thème, licences tierces |
| `src/screens/library/` | Bibliothèque (liste, import, informations) |
| `src/screens/viewer/` | Visualisation : pages, mode Continu (`ContinuousView`), gestes, défilement auto, son et mixeur (`useScoreAudio`, `MixerModal`), modales (instruments, transposition, aller à, tempo) |
| `src/screens/setlists/` | Onglet et détail des setlists, mode « Play », pré-chargement du morceau suivant |
| `src/screens/settings/` | Paramètres, capture des touches du pédalier |
| `src/core/` | Logique sans interface, testée : `import/`, `musicxml/`, `render/`, `timeline/`, `playback/`, `audio/` (MIDI, synthé, mixeur), `navigation/`, `music/`, `setlists/`, `profile/`, `storage/` |
| `src/state/` | Stores Zustand (bibliothèque, setlists, paramètres) |
| `src/i18n/` | Traductions (`locales/en` = référence, `locales/fr`) |
| `e2e/` | Scripts de bout en bout (Playwright) |
| `android/` | Projet Android généré par Capacitor (intent « Ouvrir avec ») |
| `spikes/` | Code jetable de la phase 0 |
| `test-scores/` | Partitions de test personnelles (**non versionnées**) |
