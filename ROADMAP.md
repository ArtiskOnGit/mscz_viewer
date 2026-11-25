# Roadmap

Les estimations sont indicatives, pour un développeur seul sur son temps libre. Chaque phase se termine par une **version utilisable**.

**Cadre validé** (voir [DECISIONS.md](docs/DECISIONS.md)) : **Android d'abord**, publication sur les stores à terme, licence **GPL-3.0**, **Capacitor + Ionic React + TypeScript**, interface **en anglais d'abord** et prête pour l'i18n, **mise en page adaptée à l'écran**, **pas de lecture audio** mais un **métronome optionnel**, **setlists dans la v1**, fichiers **MuseScore 3.0 à 4.x et plus**.

Légende : ⬜ à faire · 🟨 en cours · ✅ fait

---

## Phase 0 — Cadrage et validations techniques (spikes)

**Objectif** : lever les risques techniques **avant** d'écrire l'application. Chaque spike produit une courte note de résultats dans `docs/spikes/`.

- ✅ Trancher les questions de cadrage (plateforme, licence, framework, langues, audio, setlists).
- ⬜ Choisir le nom de l'application (ADR-006).
- ✅ **Corpus de test** : 4 fichiers réels (MuseScore **2.1, 3.6.2, 4.5.2, 4.6.2**) dans `test-scores/` (non versionné). À compléter au fil de l'eau : grilles d'accords, paroles, D.S. al Coda.
- ✅ **S1 — webmscore** (PC + Chromium ; [résultats](docs/spikes/PHASE0_RESULTATS.md#s1--webmscore-121-musescore-40-en-wasm)) : charger le corpus dans une page web, puis dans une WebView Capacitor Android.
  - Les fichiers **3.x** sont-ils bien lus par le moteur 4.0 ? Les fichiers **4.1 et plus** se chargent-ils ? Quels éléments sont perdus ?
  - Mesurer le temps d'initialisation, le temps de chargement et la mémoire.
  - Vérifier `saveXml()`, `metadata()` et `savePositions()` (reprises dépliées ? temps en ms ? changements de tempo ?).
- ✅ **S2 — Verovio** : afficher le MusicXML exporté par webmscore.
  - Qualité : paroles, accords, reprises, nuances, batterie, tablatures, multi-portées.
  - Mise en page à la taille de l'écran, temps de relayout sur un téléphone Android milieu de gamme.
  - Silences multi-mesures en vue partie.
- ✅ **S3 — Timeline** (+ prototype de filtrage qui conserve les tempos) : correspondance des mesures webmscore ↔ Verovio (anacrouses, reprises, D.S. al Coda), extraction de la métrique et du tempo par mesure. Prototype de défilement continu.
- ✅ **S4 — Transposition** : option `transpose` de Verovio sur MusicXML (armures, accords, instruments transpositeurs, hauteur réelle et hauteur écrite).
- ⏭️ **S5 — Pédalier** (OK en navigateur ; **reporté en phase 1**, test sur téléphone dans l'application) : réception des touches d'un pédalier ou clavier Bluetooth dans la WebView Android.
- ⏭️ **S6 — Métronome** (OK en Chromium, 0 clic en retard ; **reporté en phase 1**) : régularité des clics Web Audio dans la WebView Android (ordonnanceur avec anticipation), latence, comportement écran verrouillé ou application en arrière-plan.
- ✅ **Point de décision** : ADR-001, ADR-002 et ADR-008 **confirmées**, ADR-012 ajoutée (filtrage des parties).
- ⏭️ **Mesures sur un vrai téléphone Android** : le banc de test web n'a pas pu charger de fichier sur le téléphone (l'onglet est tué pendant le sélecteur). On les fera **dans la première version APK** (phase 1).

✅ **Phase 0 close le 2026-11-25** — [résultats](docs/spikes/PHASE0_RESULTATS.md).

**Livrable** : notes de spikes + décisions confirmées. *(environ 2 à 4 semaines)*

---

## Phase 1 — MVP « Lecteur » (Android)

**Objectif** : ouvrir un `.mscz`, choisir ses instruments, lire et tourner les pages, sans réseau.

**Socle**
- ✅ Initialiser le projet : Vite + React + Ionic + TypeScript + Capacitor (Android), ESLint, Vitest, Playwright (test de fumée).
- ✅ **i18n dès le premier écran** : i18next + react-i18next, fichiers `en` de référence, règle de lint « pas de chaîne en dur », test de complétude des langues.
- ✅ CI GitHub Actions (dépôt privé `ArtiskOnGit/mscz_viewer`) : lint, typecheck, tests, build web, **APK de debug signé avec une clé fixe** (secret `ANDROID_DEBUG_KEYSTORE_B64`), donc les mises à jour s'installent sans désinstaller.
- ✅ Navigation entre les 3 écrans (Bibliothèque avec onglets Partitions/Setlists, Visualisation, Paramètres), thème clair/sombre (système).
- ✅ `LibraryRepository` / `ViewStateRepository` : index JSON, fichiers, migrations, écritures atomiques.

**Bibliothèque**
- ✅ Bouton Import (sélecteur de fichiers, multi-sélection).
- ✅ Import webmscore (un worker par fichier) : MusicXML, métadonnées, miniature, timeline (avec métrique).
- ✅ Import des MusicXML/MXL (via webmscore aussi, pour une timeline homogène).
- ✅ Liste des partitions avec miniature, titre et compositeur. Recherche et tri.
- 🟨 Supprimer, renommer ✅ ; écran d'informations à faire.
- ✅ Détection des doublons. Messages d'erreur d'import compréhensibles.

**Visualisation**
- ✅ Worker de rendu Verovio (mise en page adaptée à l'écran), rendu paresseux et pré-rendu des pages voisines.
- ✅ Mode Pages : balayage, zones de tap, clavier/pédalier, boutons, indicateur de page ; tap au centre = masquer les barres.
- ✅ Choix des instruments (sélection multiple, filtrage MusicXML, noms masqués pour une partie seule).
- ✅ Zoom (pincement + boutons, relayout ; zoom automatique selon le nombre de portées).
- ✅ Écran toujours allumé.
- ✅ Silences multi-mesures regroupés (sous-agent, 19 tests).
- ✅ Survie au sélecteur de fichiers (`appRestoredResult`, chargement différé des moteurs) — à vérifier sur téléphone.
- ⬜ **Mesures sur téléphone** (reportées de la phase 0) : temps d'import et de rendu, mémoire, pédalier Bluetooth, régularité du métronome.
- ✅ Mémorisation par partition : instruments, zoom, page.

**Paramètres (version minimale)**
- ⬜ Langue, thème, mode d'affichage par défaut, zoom par défaut, écran allumé, « About » + licences open source + lien vers les sources (GPL).

**Livrable** : APK v0.1 (GitHub Releases), utilisable en répétition. *(environ 6 à 10 semaines)*

---

## Phase 2 — « Répétition » (Android)

**Objectif** : les fonctions qui font la différence au pupitre et en concert.

- ⬜ **Défilement automatique** au tempo : horloge partagée, timeline, facteur de tempo, décompte, départ depuis une mesure, surlignage de la mesure courante, reprises.
- ⬜ **Métronome optionnel** : clic Web Audio avec accent, indicateur visuel, synchronisé avec le défilement ou utilisé seul, réglages (volume, accent, visuel).
- ⬜ **Mode Continu** (rouleau vertical) avec ligne de lecture.
- ⬜ **Transposition** : demi-tons, tonalité cible, octave, hauteur réelle et hauteur écrite, préférence ♯/♭.
- ⬜ **Setlists** : création, ajout de partitions, réordonnancement par glisser-déposer, notes, surcharge des instruments et de la transposition par entrée, mode « Play » avec morceau suivant/précédent (pédalier inclus), pré-chargement du morceau suivant.
- ⬜ **Pédalier Bluetooth** : actions configurables (page, lecture, métronome, morceau suivant), écran de capture de touche.
- ⬜ **Demi-page**.
- ⬜ **Aller à la mesure / marque de répétition**.
- ⬜ **Mode verrouillé** contre les touchers accidentels.
- ⬜ **Thèmes de partition** : sépia, sombre, contraste élevé.
- ⬜ **Profil « My instrument »** : présélection automatique de la partie.
- ⬜ Notation des notes (C D E / Do Ré Mi / C D E H).
- ⬜ Écran Paramètres complet (voir les [spécifications fonctionnelles](docs/SPECIFICATIONS_FONCTIONNELLES.md#34-écran-paramètres)).
- ⬜ « Open with / Share to » sur Android.

**Livrable** : v0.5, en bêta fermée (Google Play test interne ou APK). *(environ 8 à 10 semaines)*

---

## Phase 3 — v1.0 : finition, publication Android, préparation iOS

- ⬜ **Traduction française** (première langue ajoutée, qui valide la chaîne i18n). Ouverture d'une plateforme de traduction (Weblate ou Crowdin).
- ⬜ Deux pages côte à côte sur tablette en paysage.
- ⬜ Optimisation des performances (cache disque SVG, gros conducteurs, appareils modestes).
- ⬜ Accessibilité (tailles des cibles tactiles, lecteurs d'écran pour la bibliothèque, les setlists et les paramètres).
- ⬜ Tests de non-régression visuels sur le corpus.
- ⬜ **Publication Android** : Google Play (fiche en anglais, politique de confidentialité « aucune donnée collectée ») + **F-Droid** (build reproductible, métadonnées).
- ⬜ **Décision iOS** (ADR-005) : publier avec webmscore, demander une autorisation à Muse Group, ou variante sans webmscore.
- ⬜ Build iOS (Capacitor), tests iPhone/iPad, ouverture de fichiers (UTI), dossier dans l'application Fichiers, métronome et bouton silencieux.
- ⬜ Publication App Store selon la décision.

**Livrable** : **v1.0** sur les stores Android, puis iOS. *(environ 6 à 8 semaines)*

---

## Phase 4 — Évolutions (après la v1, par ordre de priorité indicatif)

- ⬜ **Boucle** sur une plage de mesures (travail d'un passage).
- ⬜ Métronome : subdivisions, choix des sons, calibration de la latence.
- ⬜ Étiquettes, dossiers, favoris.
- ⬜ Setlists : séparateurs (« Intermission »), export/partage d'une setlist.
- ⬜ Combinaisons d'instruments enregistrées (« Brass », « Rhythm section »).
- ⬜ Sauvegarde et restauration de la bibliothèque (export ZIP).
- ⬜ Import MEI.
- ⬜ **Annotations** sur un calque (crayon, surligneur, doigtés) sans modifier le fichier.
- ⬜ Partage local entre appareils (ex. le chef envoie la setlist aux musiciens), sans serveur.
- ⬜ Mise à jour de webmscore sur un MuseScore récent, ou convertisseur `.mscx` maison (selon les résultats de S1 et la décision iOS).
- ⬜ Autres langues (via les contributions de traduction).

**Écarté** : lecture audio de la partition (ADR-010), mise en page d'origine (ADR-002).

---

## Risques principaux

| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| webmscore (MS 4.0) lit mal les fichiers MuseScore récents (4.1+) | Moyenne | **Élevé** | Spike S1 ; import MusicXML en repli ; plans B de l'étude |
| Fichiers MuseScore 3.0–3.x mal relus par le moteur 4.0 | Faible | Moyen | Spike S1 sur des fichiers 3.x réels |
| Rendu Verovio du MusicXML exporté insuffisant | Faible–moyenne | Élevé | Spike S2 ; plan B : SVG de webmscore |
| Performances du rendu SVG sur téléphone d'entrée de gamme | Moyenne | Moyen | Workers, rendu paresseux, cache ; plan B : Verovio natif |
| Métronome irrégulier dans la WebView | Faible | Moyen | Spike S6 ; ordonnanceur Web Audio avec anticipation ; plan B : plugin natif |
| Problème GPL / App Store | Moyenne | Moyen (iOS seulement) | Décision ADR-005 avant la phase 3 ; variante iOS sans webmscore |
| webmscore abandonné | Élevée | Moyen | Fichier d'origine conservé (réimport possible) ; import isolé derrière `ScoreImporter` |
