# Roadmap

Les estimations sont indicatives, pour un développeur seul sur son temps libre. Chaque phase se termine par une **version utilisable**.

**Cadre validé** (voir [DECISIONS.md](docs/DECISIONS.md)) : **Android d'abord**, publication sur les stores à terme, licence **GPL-3.0**, **Capacitor + Ionic React + TypeScript**, interface **en anglais d'abord** et prête pour l'i18n, **mise en page adaptée à l'écran**, **métronome optionnel** et, depuis le 2026-11-26, **lecture audio de la partition avec mixeur** (ADR-026, qui remplace « pas de lecture audio », ADR-010), **setlists dans la v1**, fichiers **MuseScore 3.0 à 4.x et plus**.

Légende : ⬜ à faire · 🟨 en cours ou partiel · ✅ fait · ⏭️ reporté

**État au 2026-11-25** : phases 0, 1 et 2 closes ; prochaine étape : phase 3. **2026-11-27** : application web installable pour l'iPhone (ADR-027). Retours de test sur téléphone : [docs/TESTS_APPAREIL.md](docs/TESTS_APPAREIL.md).

---

## Phase 0 — Cadrage et validations techniques (spikes)

**Objectif** : lever les risques techniques **avant** d'écrire l'application. Chaque spike produit une courte note de résultats dans `docs/spikes/`.

- ✅ Trancher les questions de cadrage (plateforme, licence, framework, langues, audio, setlists).
- ✅ Choisir le nom de l'application : **Pupitre** (ADR-006, 2026-11-26).
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
- ✅ Initialiser le projet : Vite + React + Ionic + TypeScript + Capacitor (Android), ESLint, Vitest, Playwright (scripts `e2e/`).
- ✅ **i18n dès le premier écran** : i18next + react-i18next, fichiers `en` de référence, règle de lint « pas de chaîne en dur », test de complétude des langues.
- ✅ CI GitHub Actions (dépôt **public** `ArtiskOnGit/mscz_viewer` depuis le 2026-11-25 ; APK publiés dans les [Releases](https://github.com/ArtiskOnGit/mscz_viewer/releases) à chaque tag `v*`) : lint, typecheck, tests, build web, **APK de debug signé avec une clé fixe** (secret `ANDROID_DEBUG_KEYSTORE_B64`), donc les mises à jour s'installent sans désinstaller (ADR-015, ADR-016).
- ✅ Navigation entre les 3 écrans (Bibliothèque avec onglets Partitions/Setlists, Visualisation, Paramètres), thème clair/sombre (système).
- ✅ `LibraryRepository` / `ViewStateRepository` / `SetlistRepository` : index JSON, fichiers, écritures atomiques.

**Bibliothèque**
- ✅ Bouton Import (sélecteur de fichiers, multi-sélection).
- ✅ Import webmscore (un worker par fichier) : MusicXML, métadonnées, miniature, timeline (avec métrique).
- ✅ Import des MusicXML/MXL (via webmscore aussi, pour une timeline homogène — ADR-017).
- ✅ Parties masquées dans MuseScore rendues visibles avant conversion (sinon leurs ligatures manquent) ; version du pipeline d'import et **réimport automatique** des partitions importées par une version plus ancienne (ADR-018).
- ✅ Liste des partitions avec miniature, titre et compositeur. Recherche et tri.
- ✅ Supprimer, renommer, informations (avec remise à zéro des réglages d'affichage).
- ✅ Détection des doublons. Messages d'erreur d'import compréhensibles.

**Visualisation**
- ✅ Worker de rendu Verovio (mise en page adaptée à l'écran), rendu paresseux et pré-rendu des pages voisines.
- ✅ Mode Pages : balayage, zones de tap, clavier/pédalier, boutons, indicateur de page ; tap au centre = masquer les barres.
- ✅ Choix des instruments (sélection multiple, filtrage MusicXML, noms masqués pour une partie seule).
- ✅ Zoom (pincement + boutons, relayout ; zoom automatique selon le nombre de portées).
- ✅ Écran toujours allumé.
- ✅ Silences multi-mesures regroupés.
- ✅ Survie au sélecteur de fichiers (`appRestoredResult`, chargement différé des moteurs).
- 🟨 **Mesures sur téléphone** (reportées de la phase 0) : l'application tourne sur un vrai téléphone ([retours](docs/TESTS_APPAREIL.md)) ; temps d'import et de rendu, mémoire et pédalier Bluetooth restent à mesurer.
- ✅ Mémorisation par partition : instruments, zoom, page, mode d'affichage, transposition, tempo.

**Paramètres (version minimale)**
- ✅ Thème de l'appli, couleurs de partition (clair/sépia/sombre/contraste), noms d'instruments, silences regroupés, zoom par défaut, gestes, écran allumé, « About » + licences + lien vers les sources.

**Livrable** : APK de debug (artefact de la CI), utilisable en répétition. ✅ *Phase 1 close le 2026-11-25.*

---

## Phase 2 — « Répétition » (Android)

**Objectif** : les fonctions qui font la différence au pupitre et en concert.

- ✅ **Défilement automatique** au tempo : horloge partagée (Web Audio), timeline (reprises dépliées), facteur de tempo 50–150 %, décompte, départ depuis la page affichée, la position de pause ou la mesure choisie par « aller à », surlignage de la mesure courante, tournage de page anticipé, toucher = pause.
- ✅ **Métronome optionnel** : clic Web Audio avec accent, indicateur visuel, synchronisé avec le défilement ; mode « métronome seul » (appui long sur le bouton métronome : bat au tempo depuis la 1re mesure de la page affichée, sans défilement ni surlignage) ; volume et décompte dans les paramètres.
- ✅ **Mode Continu** (rouleau vertical) : pages Verovio de même largeur, hauteur ajustée au contenu, empilées et rendues paresseusement (ADR-019) ; bascule Pages/Continu dans la barre d'outils (mémorisée par partition) et mode des nouvelles partitions dans les paramètres ; « suivant / précédent » (pédalier, clavier, taps latéraux, balayage) = environ un écran ; défilement automatique doux qui garde le système courant à la **ligne de lecture** (réglable, 33 % par défaut), retour immédiat aux reprises ; zoom, parties, transposition, verrouillage et « aller à » conservent la position. *(À essayer sur téléphone.)*
- ✅ **Transposition** : demi-tons, octave, préréglages Sib/Mib/Fa, tonalité résultante affichée, hauteur réelle (concert), **préférence ♯/♭** quand la tonalité a un équivalent enharmonique (Ré♭/Do♯, Sol♭/Fa♯, Si/Do♭) — ADR-020.
- ✅ **Setlists** : création, renommage, duplication, ajout de partitions (plusieurs fois possible), réordonnancement par glisser-déposer, notes, instruments et transposition par morceau (badge dans la liste), mode « Play » avec morceau suivant/précédent, double appui pédale en fin de morceau, pré-chargement du morceau suivant en arrière-plan (ouverture ≈ 1,5 s → 0,4 s en e2e — ADR-021).
- ✅ **Pédalier Bluetooth / clavier** : touches configurables pour page suivante / précédente / lecture-pause / **métronome** / **morceau suivant / précédent** (setlist), écran de capture de touche (ajouter / remplacer), retour aux valeurs par défaut. *(Vrai pédalier jamais essayé : le porteur n'en a pas.)*
- ✅ **Demi-page** (option) : haut de la page suivante au-dessus de la fin de la page courante, coupure entre deux systèmes ; le défilement automatique tourne des pages entières.
- ✅ **Aller à la mesure / marque de répétition** (numéro imprimé ou rang), ▶ repart de cette mesure.
- ✅ **Mode verrouillé** 🔒 : seuls le tournage de page (zones, balayage, défilement en mode Continu) et le pédalier restent actifs ; déverrouillage par appui long (0,8 s) ; valable pour la session.
- ✅ **Thèmes de partition** : clair, sépia, sombre, contraste élevé (faits en phase 1).
- ✅ **Profil « My instrument »** : noms libres + choix rapides, correspondance sans casse ni accents (nom de partie, identifiant MuseScore), présélection, transposition et mode d'affichage par défaut à la première ouverture.
- ✅ « Open with » sur Android (intent `VIEW` : import puis ouverture de la partition) — validé sur téléphone le 2026-11-26.
- ⏭️ Reportés en phase 3 : notation des notes (C D E / Do Ré Mi / C D E H), « Share to » (intent `SEND`), départ du défilement depuis une **mesure touchée**, le reste de l'écran Paramètres complet (fait le 2026-11-26).

✅ **Phase 2 close le 2026-11-25** (fonctions faites et testées en e2e ; essais sur téléphone partiels, voir [TESTS_APPAREIL.md](docs/TESTS_APPAREIL.md)).

**Livrable** : APK de debug de la CI, en test chez le porteur du projet.

### Retours de test sur appareil (2026-11-25)

Résumé (détail dans [docs/TESTS_APPAREIL.md](docs/TESTS_APPAREIL.md)) — sur un vrai téléphone Android :
- ✅ l'APK s'installe et se lance ; l'import fonctionne ;
- ✅ bug des **ligatures absentes sur les parties masquées** trouvé sur le téléphone, puis corrigé (réimport automatique) ;
- ✅ appuis longs (métronome seul, déverrouillage), son du métronome seul, demi-page, setlists (rapides, sans ralentissement) ;
- ⚠️ **pas de pédalier Bluetooth** chez le porteur : pédalier non testé sur l'appareil (seuls les événements clavier ont été testés) ;
- ✅ mode Continu testé le 2026-11-26 (« marche plutôt bien ») ;
- ✅ « Ouvrir avec… » et préférence ♯/♭ testés le 2026-11-26 ;
- ⬜ pas encore essayé sur l'appareil : mémoire du worker de pré-chargement.

---

## Phase 3 — v1.0 : finition, publication Android

- ⬜ **Essais sur téléphone** : mode Continu ✅, « Ouvrir avec… » ✅, préférence ♯/♭ ✅ (2026-11-26) ; à faire : « Partager vers », appui long sur une mesure, cache de rendu, pédalier Bluetooth réel, temps d'import/d'ouverture, mémoire (pré-chargement, gros conducteurs), régularité du métronome.
- ✅ **Traduction française** (première langue ajoutée, qui valide la chaîne i18n) : `locales/fr`, typographie française (espaces insécables, « guillemets »), pluriels selon les catégories de chaque langue (test de complétude adapté), réglage **Langue** (langue de l'appareil / English / Français) appliqué immédiatement et au démarrage (`<html lang>` compris), libellés trop longs raccourcis ou passés à la ligne (e2e `i18n-fr.mjs` : textes clés, débordements, captures).
- ⬜ Ouverture d'une plateforme de traduction (Weblate ou Crowdin).
- ✅ **Notation des notes** (automatique selon la langue / C D E / Do Ré Mi / C D E H avec B = Si♭) : tonalités et préréglages de transposition (« Instrument en Si♭ »), dans la fenêtre Transposition et les paramètres.
- ✅ **Changement de clé par instrument** (2026-11-27, ADR-028) : dans la fenêtre Instruments, un menu par partie (Originale / Sol / Sol 8vb / Fa / Ut 3 / Ut 4), mis en évidence quand la clé est changée ; seule la clé change (mêmes notes, repositionnées par Verovio), sur toutes les portées de la partie, jamais sur les portées de percussion ou de tablature ; changements de clé en cours de morceau retirés ; mémorisé par partition et par morceau de setlist ; préréglage brass band **« Si♭ clé de sol »** dans la fenêtre Transposition (+14 demi-tons, parties en clé de fa affichées passées en clé de sol). Tests unitaires + e2e `clefs.mjs` (glyphes SMuFL de la clé dans le SVG, rechargement, cache de rendu). ⬜ À essayer sur téléphone.
- ✅ **Paramètres restants** (2026-11-26) : police musicale (Leipzig / Bravura / Leland, incluses dans Verovio), numéros de mesure (aucun / début de ligne / toutes / toutes les 5), titre sur la première page, largeur des zones de tap (20–45 %), animation de tournage (aucune / glissement / fondu, 140 ms, coupée si « réduire les animations »), avance de tournage du défilement auto (mi-dernière mesure ou 0–4 mesures), verrouillage de l'orientation (`@capacitor/screen-orientation`), métronome actif pour les nouvelles partitions, accent du premier temps (e2e `display-settings.mjs`). ⬜ Reste : son du métronome coupé (visuel seul). Stockage ✅ (espace utilisé, vider le cache de rendu).
- ✅ **« Partager vers »** (intents `SEND` / `SEND_MULTIPLE`, plugin `@capgo/capacitor-share-target`, ADR-024) : import de un ou plusieurs fichiers, ouverture s'il n'y en a qu'un ; démarrage à froid et à chaud. *(Build Gradle validé par la CI ; à essayer sur téléphone.)*
- ✅ **Départ du défilement depuis une mesure touchée** : appui long (0,5 s) sur une mesure, en mode Pages et Continu (marque bleue, première occurrence à partir de la position courante ; relance immédiate pendant la lecture) ; e2e `pickbar.mjs`.
- ⬜ Deux pages côte à côte sur tablette en paysage.
- 🟨 **Optimisation des performances** (ADR-025) : ✅ cache disque des pages rendues (clé = XML affiché + toutes les options Verovio, 64 Mo, LRU, « Vider le cache de rendu » dans Paramètres → Stockage) ; ✅ XML affiché préparé en une passe (≈ 190 → 70 ms) ; ✅ Verovio démarré pendant la lecture des fichiers ; ✅ workers terminés en quittant la visualisation ou la setlist (e2e `performance.mjs`). Réouverture de Toccata ≈ 2,9 → 0,85 s, première ouverture ≈ 3,6 → 2,8 s (PC). ⬜ Compiler le WASM de Verovio une seule fois (≈ 1 s par worker), mesures sur un appareil modeste.
- ✅ **Accessibilité** (2026-11-26) : cibles tactiles ≥ 48 px (barres d'outils, listes, paramètres, visualisation), boutons à icône nommés en anglais et en français, éléments de liste lus en entier par les lecteurs d'écran (titre, compositeur, instruments, durée « 5 min 10 s »), bouton « plus d'actions » (les options par balayage sont inaccessibles au lecteur d'écran et au clavier), choix rapides d'instrument annoncés comme cases à cocher, contraste du thème sombre corrigé, contour de focus visible. Contrôle automatique : e2e `accessibility.mjs` (axe-core, WCAG 2.1 AA, thèmes clair et sombre ; échoue sur les violations graves). ⬜ À essayer avec TalkBack sur le téléphone.
- ✅ **Lecture audio de la partition** (2026-11-26, ADR-026, remplace ADR-010) : fichier MIDI produit à l'import par webmscore (reprises dépliées ; écart avec la timeline < 1 ms, spike S7 ; réimport automatique des partitions existantes, `IMPORTER_VERSION` 3), synthétiseur **spessasynth** (Apache-2.0) dans un AudioWorklet et banque **FluidR3Mono GM** (MIT, 14,6 Mo), chargés seulement quand on active le son ; notes envoyées par l'ordonnanceur du défilement sur la **même horloge** (tempo 50–150 %, reprises, décompte, départ depuis une mesure, pause qui coupe aussitôt) ; position affichée décalée de la latence de sortie ; **mixeur** par partie (volume, muet, solo) + volume général, raccourcis « Tous / Moi seul / Sans moi » (profil « My instrument »), mémorisé par partition et par morceau de setlist ; bouton haut-parleur dans la barre du bas (appui long = son activé/coupé), réglages par défaut dans les paramètres ; le facteur de tempo passe dans une petite fenêtre sur téléphone en portrait (place libérée pour le bouton). e2e `audio.mjs`. ⬜ À essayer sur téléphone : latence et alignement, craquements, mémoire, temps de chargement.
- ⬜ Tests de non-régression visuels sur le corpus.
- 🟨 Identifiant Android définitif ✅ (`io.github.artiskongit.pupitre`, ADR-006) ; icône ✅ (logo 4, `scripts/generate-icons.mjs`) ; **APK de release signé** à faire (clé de publication, GitHub Releases).
- ⬜ **Publication Android** : Google Play (fiche en anglais, politique de confidentialité « aucune donnée collectée ») + **F-Droid** (build reproductible, métadonnées).
- ✅ **Décision iOS** (ADR-005, 2026-11-26) : pas d'application iOS native ni d'App Store.
- ✅ **iPhone par une application web installable** (2026-11-27, ADR-027) : build PWA (`npm run build:pwa`, base `/mscz_viewer/`), publié sur **GitHub Pages** à chaque tag `v*` ; service worker qui **pré-cache tout** (≈ 44 Mo : import, rendu et son hors ligne), reprise et vérification des téléchargements, progression dans Paramètres → Stockage, « Nouvelle version disponible — Recharger », stockage persistant ; manifeste et icônes (192, 512, maskable, apple-touch-icon) ; liens profonds (`404.html`) ; iPhone : import sans filtre de type, session audio « playback », Wake Lock, zones sûres (encoche) ; réglages propres à Android masqués. e2e `pwa.mjs` hors ligne dans Chromium et WebKit (profil iPhone). ⬜ À essayer sur un vrai iPhone ([liste](docs/TESTS_APPAREIL.md)) ; ⬜ activer GitHub Pages (source « GitHub Actions »).

**Livrable** : **v1.0** sur Google Play et F-Droid. *(environ 6 à 8 semaines)*

---

## Phase 4 — Évolutions (après la v1, par ordre de priorité indicatif)

- ⬜ **Boucle** sur une plage de mesures (travail d'un passage).
- ⬜ Audio : banque de sons plus riche en option (téléchargée à la demande, ADR-026), réverbération réglable, transposition du son (instrument transpositeur joué à la hauteur écrite), mixeur dans les combinaisons d'instruments.
- ⬜ Métronome : subdivisions, choix des sons, calibration de la latence, BPM saisi en mode « métronome seul ».
- ⬜ Étiquettes, dossiers, favoris.
- ⬜ Setlists : séparateurs (« Intermission »), export/partage d'une setlist, saut direct à un morceau depuis la visualisation.
- ⬜ Combinaisons d'instruments enregistrées (« Brass », « Rhythm section »).
- ⬜ Sauvegarde et restauration de la bibliothèque (export ZIP).
- ⬜ Import MEI.
- ⬜ **Annotations** sur un calque (crayon, surligneur, doigtés) sans modifier le fichier.
- ⬜ Partage local entre appareils (ex. le chef envoie la setlist aux musiciens), sans serveur.
- ⬜ Mise à jour de webmscore sur un MuseScore récent, ou convertisseur `.mscx` maison (si des fichiers récents posent problème).
- ⬜ Autres langues (via les contributions de traduction).

**Écarté** : mise en page d'origine (ADR-002). *(La lecture audio, écartée par ADR-010, a été ajoutée le 2026-11-26 : ADR-026.)*

---

## Risques principaux

| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| webmscore (MS 4.0) lit mal les fichiers MuseScore récents (4.1+) | Moyenne | **Élevé** | Spike S1 ; import MusicXML en repli ; plans B de l'étude |
| Fichiers MuseScore 3.0–3.x mal relus par le moteur 4.0 | Faible | Moyen | Spike S1 sur des fichiers 3.x réels |
| Rendu Verovio du MusicXML exporté insuffisant | Faible | Élevé | Validé en phase 0 et sur téléphone ; défauts d'export corrigés à l'import (parties masquées) ; plan B : SVG de webmscore |
| Performances du rendu SVG sur téléphone d'entrée de gamme | Moyenne | Moyen | Workers, rendu paresseux, cache ; plan B : Verovio natif |
| Métronome irrégulier dans la WebView | Faible | Moyen | Ordonnanceur Web Audio avec anticipation ; son vérifié sur téléphone (régularité non mesurée) ; plan B : plugin natif |
| Pédaliers Bluetooth non reçus par la WebView | Faible–moyenne | Moyen | Touches configurables, testées au clavier ; à essayer avec un vrai pédalier |
| Mémoire (worker de pré-chargement, gros conducteurs, mode Continu) | Moyenne | Moyen | Un seul morceau pré-chargé ; rendu paresseux des pages en mode Continu ; à mesurer sur téléphone |
| Problème GPL / App Store | — | — | Sans objet : pas d'App Store, l'iPhone passe par l'application web (ADR-005, ADR-027) |
| iOS efface les données de l'application web, ou la tue (mémoire) | Moyenne | Moyen | Application installée sur l'écran d'accueil, stockage persistant demandé, fichiers d'origine conservés ; à vérifier sur iPhone (ADR-027) |
| webmscore abandonné | Élevée | Moyen | Fichier d'origine conservé (réimport possible) ; import isolé derrière `ScoreImporter` |
