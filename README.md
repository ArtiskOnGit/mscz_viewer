# Pupitre *(nom de travail)*

**Lecteur de partitions MuseScore pour musiciens en répétition et en concert**, sur Android (d'abord) puis iOS, **100 % hors ligne**. Interface en anglais, conçue pour être traduite.

> 🚧 **Statut : phase 0 (validations techniques).** Architecture validée sur PC ; mesures sur téléphone Android en attente. Pas encore d'application.

## Ce que fait l'application

- 📂 **Importer** des fichiers `.mscz` / `.mscx` (**MuseScore 3.0 à 4.x et plus**), ainsi que `.mxl` / `.musicxml`, depuis le stockage, le cloud ou « Ouvrir avec… ».
- 🎼 **Afficher** la partition (lecture seule), avec une mise en page **adaptée à l'écran** du téléphone ou de la tablette.
- 🎷 **Choisir les instruments** à afficher (un seul, plusieurs, ou le conducteur complet).
- 📄 **Tourner les pages** par balayage, zones de tap ou **pédalier Bluetooth**. Option demi-page.
- 🔍 **Zoomer** (pincement ou boutons). Le zoom est mémorisé pour chaque partition.
- ♯♭ **Transposer** (demi-tons, tonalité cible, hauteur réelle ou écrite).
- ▶️ **Faire défiler automatiquement** au tempo de la partition, avec les changements de tempo et les **reprises**, un facteur de tempo réglable et un décompte.
- 🥁 **Métronome optionnel** (clic + indicateur visuel), calé sur le tempo de la partition. La partition elle-même n'est jamais jouée en audio.
- 📋 **Setlists** : préparer le programme d'une répétition ou d'un concert, et enchaîner les morceaux au pédalier.
- 🌙 Thèmes clair, sépia ou sombre ; écran toujours allumé ; mode verrouillé contre les touchers accidentels.

## Écrans

1. **Bibliothèque** : onglets **Partitions** (liste + bouton **Importer**) et **Setlists**.
2. **Visualisation** : la partition en plein écran, avec instruments, pages, zoom, transposition et défilement automatique.
3. **Paramètres** : préférences d'affichage, de navigation, du pédalier, du défilement automatique, du métronome et de la langue.

## Choix techniques (résumé)

| Brique | Choix | Pourquoi |
|---|---|---|
| Multiplateforme | **Capacitor** + **Ionic React** + **TypeScript** | Les moteurs de partition sont en WebAssembly : une seule pile technique, testable dans le navigateur |
| Lecture des `.mscz` | **[webmscore](https://github.com/LibreScore/webmscore)** (MuseScore compilé en WASM, GPL) | Seul moteur libre qui lit fidèlement le format MuseScore. Utilisé **uniquement à l'import** pour produire du MusicXML |
| Rendu | **[Verovio](https://www.verovio.org)** (LGPL-3.0) | Mise en page adaptée à l'écran, transposition, timemap pour le défilement, projet très actif |
| Stockage | Fichiers locaux + index JSON | Simple, hors ligne |
| Métronome | Web Audio (sons générés, aucun fichier audio) | Précis, léger |
| i18n | i18next + react-i18next, anglais de référence | Traductions faciles à ajouter (le français en premier) |

Détails et justification : voir la documentation ci-dessous.

## Documentation

| Document | Contenu |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Phases, livrables, risques |
| [docs/SPECIFICATIONS_FONCTIONNELLES.md](docs/SPECIFICATIONS_FONCTIONNELLES.md) | Écrans, fonctions, ergonomie, paramètres, récits utilisateurs |
| [docs/SPECIFICATIONS_TECHNIQUES.md](docs/SPECIFICATIONS_TECHNIQUES.md) | Architecture, pile technique, modèle de données, pipelines d'import, de rendu et de défilement, tests |
| [docs/ETUDE_RENDU_PARTITIONS.md](docs/ETUDE_RENDU_PARTITIONS.md) | État de l'art des bibliothèques de rendu, réutilisation de MuseScore, licences |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Décisions d'architecture (ADR), réponses de cadrage et questions encore ouvertes |
| [docs/spikes/PHASE0_RESULTATS.md](docs/spikes/PHASE0_RESULTATS.md) | Résultats des validations techniques (webmscore, Verovio, timeline, transposition) |
| [spikes/README.md](spikes/README.md) | Scripts de la phase 0 et **banc de test à ouvrir sur un téléphone** |

## Licence

**GPL-3.0-or-later**, imposée par l'utilisation de webmscore (dérivé de MuseScore, GPL). Voir [ADR-003](docs/DECISIONS.md).

*MuseScore est une marque de ses propriétaires respectifs. Ce projet n'est ni affilié à MuseScore ni approuvé par MuseScore.*

## Développement

Prérequis : Node.js ≥ 22. Pour compiler l'APK : JDK 21 + Android SDK (le plus simple : Android Studio).

```bash
npm install            # copie aussi les fichiers de webmscore dans public/
npm run dev            # application dans le navigateur (http://localhost:5173)
npm test               # tests unitaires (Vitest)
npm run lint           # ESLint (dont la règle « pas de texte en dur », ADR-009)
npm run typecheck
npm run build          # build web dans dist/
npm run android        # build + synchronisation Capacitor + ouverture dans Android Studio
node e2e/smoke.mjs "$PWD"   # test de fumée des 3 écrans dans Chromium headless
```

La CI (GitHub Actions, `.github/workflows/ci.yml`) lance lint, typecheck, tests et build, puis produit un **APK de debug** téléchargeable dans les artefacts.

| Dossier | Contenu |
|---|---|
| `src/app/` | Coquille de l'application, routes |
| `src/screens/` | Écrans Bibliothèque, Visualisation, Paramètres |
| `src/core/` | Logique sans interface : modèle, filtrage MusicXML, timeline… (testée) |
| `src/i18n/` | Traductions (`locales/en` = référence) |
| `android/` | Projet Android généré par Capacitor |
| `spikes/` | Code jetable de la phase 0 |
| `test-scores/` | Partitions de test personnelles (**non versionnées**) |
