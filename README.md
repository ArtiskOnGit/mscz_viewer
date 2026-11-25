# Pupitre *(nom de travail)*

**Lecteur de partitions MuseScore pour musiciens en répétition et en concert**, sur Android (d'abord) puis iOS, **100 % hors ligne**. Interface en anglais, conçue pour être traduite.

> 🟢 **Statut : phase 2 terminée (2026-11-25).** L'application Android fonctionne (APK de debug produit par la CI) et a été essayée sur un vrai téléphone ([retours](docs/TESTS_APPAREIL.md)). Prochaine étape : phase 3 (traduction française, finitions, publication). Voir la [roadmap](ROADMAP.md).

## Ce que fait l'application

- 📂 **Importer** des fichiers `.mscz` / `.mscx` (**MuseScore 2.x, 3.x et 4.x** ; testés : 2.1, 3.6, 4.5, 4.6) et `.mxl` / `.musicxml` / `.xml`, depuis le sélecteur de fichiers (multi-sélection) ou « Ouvrir avec… » sur Android. Doublons détectés, recherche, tri, renommage, informations.
- 🎼 **Afficher** la partition (lecture seule), toujours **remise en page pour l'écran** du téléphone ou de la tablette.
- 🎷 **Choisir les instruments** à afficher (un seul, plusieurs, ou le conducteur complet), avec silences multi-mesures regroupés et profil **« My instrument »** qui présélectionne sa partie.
- 📄 **Deux modes d'affichage** : **Pages** (balayage, zones de tap, boutons, clavier/pédalier, option **demi-page**) ou **Continu** (un seul rouleau vertical).
- 🔍 **Zoomer** (pincement ou boutons, nouvelle mise en page). Le zoom est mémorisé pour chaque partition.
- ♯♭ **Transposer** (demi-tons, octave, préréglages Si♭/Mi♭/Fa, hauteur réelle, choix ♯/♭ pour les tonalités enharmoniques).
- ▶️ **Faire défiler automatiquement** au tempo de la partition, avec les changements de tempo et les **reprises**, un facteur de tempo (50–150 %), un décompte et le surlignage de la mesure en cours.
- 🥁 **Métronome optionnel** (clic + indicateur visuel), calé sur le tempo de la partition, avec ou sans défilement (« métronome seul »). La partition elle-même n'est jamais jouée en audio.
- 🧭 **Aller à une mesure** ou à une **marque de répétition** ; **mode verrouillé** contre les touchers accidentels.
- 🦶 **Pédalier Bluetooth / clavier** : touches configurables pour page suivante/précédente, lecture/pause, métronome, morceau suivant/précédent.
- 📋 **Setlists** : préparer le programme d'une répétition ou d'un concert (instruments et transposition par morceau), puis enchaîner les morceaux ; le morceau suivant est pré-chargé.
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
| Stockage | Fichiers locaux + index JSON | Simple, hors ligne |
| Défilement et métronome | Horloge commune sur Web Audio (sons générés, aucun fichier audio) | Précis, léger, toujours synchronisés |
| i18n | i18next + react-i18next, anglais de référence | Traductions faciles à ajouter (le français en premier) |

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

## Licence

**GPL-3.0-or-later**, imposée par l'utilisation de webmscore (dérivé de MuseScore, GPL). Voir [ADR-003](docs/DECISIONS.md).

*MuseScore est une marque de ses propriétaires respectifs. Ce projet n'est ni affilié à MuseScore ni approuvé par MuseScore.*

## Installer l'APK sur un téléphone

**Le plus simple :** télécharger le fichier `pupitre-vX.Y.Z.apk` de la dernière version dans les [**Releases**](https://github.com/ArtiskOnGit/mscz_viewer/releases/latest), directement depuis le téléphone, puis l'ouvrir (autoriser l'installation d'applications depuis cette source).

Les APK sont signés avec une **clé fixe** (secret `ANDROID_DEBUG_KEYSTORE_B64`, ADR-016) : une nouvelle version s'installe par-dessus la précédente sans perdre les partitions. Ce sont encore des versions de test (signature « debug ») ; la signature de publication pour les stores viendra en phase 3.

### Publier une nouvelle version

```bash
npm version 0.3.0 --no-git-tag-version   # met à jour package.json
git commit -am "Release 0.3.0" && git tag v0.3.0 && git push && git push --tags
```

Le workflow `.github/workflows/release.yml` (déclenché par un tag `v*`) lance lint et tests, compile l'APK (versionName = tag, versionCode = numéro de build) et crée la release GitHub avec `pupitre-v0.3.0.apk` en pièce jointe.

### APK de développement

À chaque push sur `main`, la CI (`.github/workflows/ci.yml`) lance lint, typecheck, tests et build web, puis produit aussi un APK (artefact `pupitre-debug-apk`, conservé 14 jours) : `gh run download --name pupitre-debug-apk`.

## Développement

Prérequis : Node.js ≥ 22 (la CI utilise Node 24). Le SDK Android n'est **pas** nécessaire en local : l'APK est compilé par la CI (ADR-015). Pour compiler soi-même : JDK 21 + Android SDK (Android Studio), puis `npm run android`.

```bash
npm install            # copie aussi les fichiers de webmscore dans public/ (scripts/copy-webmscore.mjs)
npm run dev            # application dans le navigateur (http://localhost:5173)
npm test               # tests unitaires (Vitest)
npm run lint           # ESLint (dont la règle « pas de texte en dur », ADR-009)
npm run typecheck      # tsc -b
npm run build          # build web dans dist/
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
node e2e/setlists.mjs "$PWD" /tmp/shots      # setlists, morceau suivant, pré-chargement
node e2e/profile.mjs "$PWD" /tmp/shots       # profil « My instrument »
node e2e/settings.mjs "$PWD" /tmp/shots      # couleurs de partition
```

| Dossier | Contenu |
|---|---|
| `src/app/` | Coquille de l'application, routes, thème, licences tierces |
| `src/screens/library/` | Bibliothèque (liste, import, informations) |
| `src/screens/viewer/` | Visualisation : pages, mode Continu (`ContinuousView`), gestes, défilement auto, modales (instruments, transposition, aller à) |
| `src/screens/setlists/` | Onglet et détail des setlists, mode « Play », pré-chargement du morceau suivant |
| `src/screens/settings/` | Paramètres, capture des touches du pédalier |
| `src/core/` | Logique sans interface, testée : `import/`, `musicxml/`, `render/`, `timeline/`, `playback/`, `navigation/`, `music/`, `setlists/`, `profile/`, `storage/` |
| `src/state/` | Stores Zustand (bibliothèque, setlists, paramètres) |
| `src/i18n/` | Traductions (`locales/en` = référence) |
| `e2e/` | Scripts de bout en bout (Playwright) |
| `android/` | Projet Android généré par Capacitor (intent « Ouvrir avec ») |
| `spikes/` | Code jetable de la phase 0 |
| `test-scores/` | Partitions de test personnelles (**non versionnées**) |
