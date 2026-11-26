# Journal des décisions (ADR) et questions ouvertes

Format : chaque décision a un statut **Proposée** (en attente), **Acceptée**, **Acceptée sous réserve de spike** (à confirmer en phase 0), **Remplacée** ou **Rejetée**.

## Réponses du porteur du projet (2026-11-25)

| Question | Réponse | Conséquence |
|---|---|---|
| Plateforme prioritaire | **Android d'abord** puis, le 2026-11-26 : **Android uniquement** | Pas de version iOS (ADR-005) |
| Publication | **Sur les stores, à terme** | Google Play + F-Droid (+ GitHub Releases) ; pas d'App Store (ADR-005) |
| Licence GPL-3.0 | **Oui** | ADR-003 acceptée |
| Framework UI | **Le plus simple et multiplateforme** | React + Ionic (ADR-004) |
| Langues | **Anglais d'abord, conçu pour l'i18n** | ADR-009 |
| Mise en page | **Adaptée à l'écran** | Pas de mode « mise en page d'origine » prévu (ADR-002) |
| Audio | **Pas de lecture de la partition, mais un métronome en option** | ADR-010 |
| Setlists | **Oui, dans la v1** | ADR-011 |
| Versions MuseScore | **3.0 à 4.x et plus** ; fichiers de test fournis à la demande | Corpus et spike S1 élargis à MuseScore 3.x |

---

## Décisions

### ADR-001 — Lecture des `.mscz` : webmscore, à l'import uniquement — *Acceptée* (S1 validé le 2026-11-25, voir [résultats de la phase 0](spikes/PHASE0_RESULTATS.md))
- **Contexte** : aucune bibliothèque de rendu ne lit le format MuseScore, qui n'est pas documenté et change d'une version à l'autre. Il faut prendre en charge les fichiers **MuseScore 3.0 à 4.x et plus**.
- **Décision** : utiliser **webmscore** (MuseScore 4.0 compilé en WASM) pour convertir les fichiers en MusicXML et extraire les métadonnées et la timeline. MuseScore 4.0 sait ouvrir les fichiers 3.x, ce qui couvre normalement la plage 3.0–3.6.
- **Résultat de S1** : les fichiers **2.1, 3.6.2, 4.5.2 et 4.6.2** du corpus se chargent. `savePositions(true)` plante et corrompt l'instance WASM. Règle : **un worker neuf par import**, positions des mesures seulement. Import vérifié sur un vrai téléphone Android ; temps à mesurer.
- **Depuis** : webmscore sert aussi à importer le MusicXML (ADR-017) ; les parties masquées sont rendues visibles avant conversion (ADR-018).
- **Plans B** : a) recompiler webmscore sur un MuseScore récent ; b) convertisseur `.mscx` → MusicXML maison ; c) demander un export MusicXML (toujours pris en charge).

### ADR-002 — Rendu : Verovio sur MusicXML, mise en page adaptée à l'écran — *Acceptée* (S2 et S4 validés le 2026-11-25)
- **Décision** : **Verovio** (LGPL-3.0), toujours avec une **mise en page recalculée pour l'écran** (`breaks: 'auto'`). Les sauts de page et de système d'origine ne sont pas reproduits.
- **Non retenu** : le mode « mise en page d'origine » (SVG de webmscore). Il reste seulement un plan B technique si la qualité de Verovio est insuffisante.

### ADR-003 — Licence de l'application : GPL-3.0-or-later — *Acceptée*
- Imposée par webmscore. Verovio (LGPL), les polices (OFL) et les dépendances MIT/BSD sont compatibles.
- Le dépôt `ArtiskOnGit/mscz_viewer` a été privé pendant le développement, puis **rendu public le 2026-11-25** (obligation GPL : sources disponibles). Le lien « Source code » de l'écran À propos pointe vers ce dépôt.

### ADR-004 — Framework : Capacitor + Ionic **React** + TypeScript — *Acceptée*
- **Critère du porteur** : le plus simple et le plus multiplateforme.
- **Pourquoi React plutôt que Svelte** : Ionic ne propose officiellement que Angular, React et Vue, donc pas Svelte. React a le plus de documentation, d'exemples et de bibliothèques. Capacitor fournit Android, iOS et le web à partir de la même base.

### ADR-005 — Distribution : Android uniquement — *Acceptée (2026-11-26)*
- **Android** : APK direct (GitHub Releases), puis **F-Droid** et **Google Play**. La GPL ne pose pas de problème sur ces canaux.
- **Décision du porteur (2026-11-26) : pas de version iOS.** Le projet ne cible qu'Android. Les éléments ci-dessous restent pour mémoire, si la question revenait un jour.
- **iOS / App Store (pour mémoire)** : la compatibilité de la GPL avec les conditions de l'App Store est contestée. Une plainte d'un ayant droit de MuseScore pourrait faire retirer l'application. Options à étudier **avant la phase 3** :
  1. publier quand même (risque accepté ; d'autres applications GPL y sont publiées) ;
  2. demander une autorisation écrite ou une exception à Muse Group (détenteur principal des droits) ;
  3. publier sur iOS une variante **sans webmscore** (import MusicXML seulement, voire un convertisseur `.mscx` maison sous licence permissive).
- Exigence commune : le pipeline d'import reste isolé derrière une interface (`ScoreImporter`) pour pouvoir remplacer webmscore sans toucher au reste.

### ADR-006 — Nom de l'application : « Pupitre » — *Acceptée (2026-11-26)*
- Nom définitif : **Pupitre** (français pour « music stand »), y compris pour l'interface anglaise : choix assumé du porteur du projet (« tant pis pour les anglais »).
- Reste à faire avant publication : vérifier la disponibilité sur Google Play et F-Droid et l'absence de marque déposée gênante ; ~~créer l'icône~~ : **logo 4 « version épurée »** retenu le 2026-11-26 (cinq lignes de portée formant le plateau d'un pupitre, bleu nuit `#24398f` et orange `#e8590c` sur crème `#f4ecd8`, formes géométriques SVG uniquement ; `design/logo/4-ligne-epuree.svg`). Icônes Android (adaptative, carrée, ronde), écrans de démarrage et favicon générés par `scripts/generate-icons.mjs`.
- **Identifiant Android** (`applicationId`, immuable une fois publié) : **`io.github.artiskongit.pupitre`** (2026-11-26), basé sur le compte GitHub du porteur (convention F-Droid, aucun domaine à posséder). Il remplace `app.pupitre.viewer` : une réinstallation unique a été nécessaire sur le téléphone de test. Le nom ne doit pas contenir « MuseScore ».

### ADR-007 — Stockage : fichiers + index JSON — *Acceptée*
- Index `library.json` et `setlists.json`, fichiers dans l'espace privé de l'application, derrière les interfaces `LibraryRepository` et `SetlistRepository`. Passage à SQLite si le volume ou la recherche le demandent.

### ADR-008 — Timeline du défilement et du métronome — *Acceptée* (S3 validé le 2026-11-25)
- Positions MuseScore (webmscore) à l'import pour les `.mscz`, avec reprises dépliées et changements de tempo. Timemap Verovio pour le MusicXML.
- La timeline contient aussi la **métrique de chaque mesure** (nombre de temps, unité), dont le métronome a besoin.
- **Résultat de S3** : l'ordre de jeu est identique entre MuseScore et Verovio (en retirant les suffixes `-rendN` de Verovio). Le filtrage des parties doit **recopier les tempos et repères** de la première partie (ADR-012).

### ADR-009 — Internationalisation : anglais d'abord, i18n dès le départ — *Acceptée*
- Langue de référence de l'interface : **anglais**. Le français est la première traduction ajoutée (phase 3) ; réglage « Langue » (langue de l'appareil par défaut).
- **i18next + react-i18next**. **Aucune chaîne en dur** dans les composants, ce qui est vérifié par une règle de lint (`eslint-plugin-i18next`).
- Clés structurées par écran (`library.import.button`), pluriels ICU, formats de date et de nombre via `Intl`.
- Noms de notes et de tonalités localisables : *C/D/E* en anglais, *Do/Ré/Mi* en français, et un réglage « notation des notes » indépendant de la langue (fait en phase 3 ; allemande *C D E … H*, B = Si♭).
- Interface prête pour les langues de droite à gauche (CSS logique : `margin-inline-start`…), sans en faire une priorité.
- La documentation du projet reste en français pour l'instant.

### ADR-010 — Pas de lecture audio ; métronome optionnel — *Acceptée*
- **Pas de synthèse audio** de la partition : pas de SoundFont, et pas de `synthAudio` de webmscore.
- **Métronome optionnel** : clic généré avec Web Audio (oscillateur, aucun fichier son), calé sur le tempo de la partition, ses changements de tempo et de métrique, et le facteur de tempo. Il est utilisable **pendant le défilement automatique** ou **seul**.
- iOS (sans objet depuis ADR-005, Android uniquement) : Web Audio est coupé par le bouton silencieux. On le signalera dans l'interface, ou on passera par une session audio native si nécessaire.

### ADR-011 — Setlists dans la v1 — *Acceptée*
- Les setlists (programmes de répétition ou de concert) font partie de la v1, et sont prévues en phase 2.
- Une entrée de setlist pointe vers une partition. Elle utilise les réglages mémorisés de la partition (instruments, transposition, zoom), avec une **surcharge optionnelle** propre à l'entrée (en v1 : instruments et transposition, préférence ♯/♭ comprise).
- **Fait en phase 2** (2026-11-25), avec le pré-chargement du morceau suivant (ADR-021).

---

### ADR-012 — Filtrage des parties : recopie des indications « système » — *Acceptée*
- **Contexte** (S3) : MuseScore n'exporte tempo, métronome et repères que dans la **première partie** du MusicXML. Si on la retire, tempos et timeline sont perdus.
- **Décision** : le module de filtrage recopie ces indications (`<sound tempo|dacapo|segno|dalsegno|coda|tocoda|fine>`, `<metronome>`, `<rehearsal>`, `<segno>`, `<coda>`) vers la première partie conservée, à la même position rythmique. Le prototype est dans `spikes/shared/filter-parts.mjs`.
- **Limite connue** : les textes système sans effet sonore (« Swing », titres de section) ne se distinguent pas des textes de portée en MusicXML. Ils ne sont pas recopiés pour l'instant.

### ADR-013 — Moteurs embarqués : tailles réelles — *Information*
- webmscore ~18 Mo (wasm 9,2 + mem 4,2 + data 4,1 + JS), Verovio ~8,4 Mo (WASM intégré au JS). Total des moteurs : **~27 Mo** dans l'APK.

### ADR-014 — React Router 6 malgré des alertes `npm audit` — *Acceptée (à revoir)*
- Ionic React 9 n'accepte que React Router `>=6.4 <7`. `npm audit` signale 3 vulnérabilités « modérées » corrigées en v7. Elles concernent les fonctions serveur et chargement de données, que nous n'utilisons pas : l'application n'a pas de serveur et ses routes sont locales.
- On repassera en v7 dès qu'Ionic le prendra en charge.

### ADR-015 — APK compilé par GitHub Actions, pas de SDK Android en local — *Acceptée*
- **Contexte** : le poste de développement n'a pas de SDK Android ; l'installer (Android Studio, ~10 Go) seulement pour produire un APK de test est lourd.
- **Décision** : la CI (`.github/workflows/ci.yml`, dépôt `ArtiskOnGit/mscz_viewer`) fait lint, typecheck, tests et build web, puis `cap sync android` et `gradlew assembleDebug` (JDK 21) sur un runner Ubuntu. L'APK est un artefact téléchargeable (`pupitre-debug-apk`, `gh run download`). Le développement courant se fait dans le navigateur et avec les scripts e2e (Chromium headless, émulation Pixel 7).
- **Conséquence** : chaque essai sur téléphone passe par un push sur `main`. Compiler en local reste possible (`npm run android`).

### ADR-016 — APK de debug signés avec une clé fixe stockée dans les secrets — *Acceptée*
- **Contexte** : chaque runner génère sa propre clé de debug ; Android refuse alors d'installer la nouvelle version par-dessus l'ancienne (il faut désinstaller, donc perdre la bibliothèque).
- **Décision** : un `debug.keystore` fixe, encodé en base64 dans le secret `ANDROID_DEBUG_KEYSTORE_B64`, est restauré dans `~/.android/` avant la compilation. Ce n'est **pas** une clé de publication : la release (phase 3) aura sa propre clé.
- **Si le secret est perdu** : en générer un nouveau ; une seule désinstallation sera nécessaire.

### ADR-017 — webmscore pour tous les imports, MusicXML compris — *Acceptée* (écart avec la spécification initiale)
- **Spécification initiale** : analyser le MusicXML directement et calculer sa timeline avec la timemap de Verovio à la première ouverture.
- **Décision** : les `.mxl` / `.musicxml` passent aussi par webmscore (`WebMscore.load('mxl' | 'musicxml', …)`). On obtient le même MusicXML normalisé, les mêmes métadonnées et la même timeline (positions MuseScore, reprises dépliées) pour tous les formats : un seul chemin de code, testé.
- **Conséquence** : la timemap de Verovio n'est pas utilisée. Une variante iOS sans webmscore (ADR-005, option 3) devra la réintroduire.

### ADR-018 — Parties masquées rendues visibles à l'import ; version du pipeline et réimport automatique — *Acceptée*
- **Constat** (sur téléphone, fichier MuseScore 4.5) : les parties masquées dans MuseScore n'ont **pas de ligatures** dans le MusicXML exporté, car MuseScore ne les met pas en page.
- **Décision** : avant la conversion, une copie du fichier est modifiée pour rendre visibles toutes les parties et portées (`<Part><show>`, `<Staff><isStaffVisible>` en MuseScore 4, `<Staff><invisible>` en MuseScore 3). La visibilité d'origine est conservée pour choisir les parties affichées par défaut.
- Chaque partition mémorise `importerVersion`. Quand le pipeline change (`IMPORTER_VERSION`, actuellement 2), la bibliothèque **réimporte automatiquement** les partitions plus anciennes à partir du fichier d'origine conservé, en gardant identifiant, titre et réglages.

### ADR-019 — Mode Continu : pages Verovio empilées, rendu paresseux — *Acceptée*
- **Options étudiées** : une seule page très haute (une seule `renderToSVG`, mais un SVG énorme et un rendu long pour les gros conducteurs) ; pages de la largeur de l'écran avec `adjustPageHeight` empilées dans un défilement natif.
- **Décision** : la seconde. Le même worker Verovio produit des pages de la largeur de l'écran dont la hauteur suit le contenu. Seules les pages proches de la position de lecture sont dans le DOM (fenêtre de 4 pages rendues, 8 gardées) ; les autres sont des emplacements de hauteur mesurée ou estimée. La vue gère elle-même l'ancrage du défilement (`overflow-anchor: none`) pour que la musique lue ne bouge pas quand une page au-dessus est rendue.
- **Défilement automatique** : la position cible met le système de la mesure courante à la ligne de lecture et avance vers le système suivant au fil des mesures ; un ressort à amortissement critique (solution exacte, indépendante de la fréquence d'images) lisse le mouvement. Saut immédiat pour une reprise (retour de plus de 10 % d'écran) ou une cible lointaine ; le suivi se suspend 1,5 s quand l'utilisateur fait défiler au doigt.
- **Taps** : centre = barres d'outils ; tiers gauche/droit = un écran vers le haut/bas (comme le pédalier, 85 % d'écran). Choix fait pour que les zones de tap gardent le même rôle (« précédent / suivant ») dans les deux modes.

### ADR-020 — Transposition passée à Verovio sous forme d'intervalle ; préférence ♯/♭ — *Acceptée*
- **Contexte** : Verovio accepte pour `transpose` un nombre de demi-tons (`+1`), un intervalle (`m2`, `-A1`, `M9`) ou une tonique (`Db`, `C#`). Vérifié avec Verovio 6.4 dans Node (test `src/core/music/accidentals.test.ts`) : une tonique choisit elle-même le sens (pas de contrôle de l'octave), alors qu'un intervalle fixe à la fois l'orthographe et l'octave.
- **Décision** : quand la tonalité écrite est connue, l'application calcule la tonalité d'arrivée (préférence auto / ♯ / ♭ ; auto = le moins d'altérations, ♭ en cas d'égalité, tonalité écrite gardée pour une transposition d'octaves) puis l'**intervalle** correspondant, qu'elle passe à Verovio. La tonalité affichée dans la fenêtre de transposition est donc exactement celle du rendu. En hauteur réelle, on part de la tonalité sonnante de la première partie. Sans tonalité connue, on garde le nombre de demi-tons.
- La préférence est mémorisée par partition et dans les surcharges de setlist.

### ADR-021 — Setlists : pré-chargement du morceau suivant dans un second worker — *Acceptée*
- Pendant la lecture d'un morceau en mode setlist, le morceau suivant est préparé en arrière-plan : lecture des fichiers, XML affiché, **chargement et mise en page dans un second worker Verovio**, rendu de sa première page. Le viewer suivant reprend ce worker tel quel. Ouverture mesurée en e2e : ≈ 1,5 s sans pré-chargement, ≈ 0,4 s avec.
- Un seul emplacement (le morceau suivant) pour borner la mémoire : au plus deux instances Verovio en même temps. Mémoire réelle à mesurer sur téléphone.
- Autres choix de la visualisation faits pendant la phase 2 : le **mode verrouillé** vaut pour la session (il n'est pas enregistré) ; la **demi-page** coupe entre deux systèmes (jamais à travers une portée) ; l'appui long sur le métronome lance le **métronome seul**.

### ADR-022 — TypeScript 6 épinglé — *Acceptée (à revoir)*
- `typescript-eslint` ne prend pas encore en charge TypeScript 7. La version est épinglée à `~6.0.3` dans `package.json`. On montera de version quand typescript-eslint le permettra.

### ADR-023 — Distribution des APK par les Releases GitHub — *Acceptée*
- Le dépôt est public (2026-11-25). Un tag `vX.Y.Z` déclenche `.github/workflows/release.yml` : lint + tests, APK (versionName = tag, versionCode = numéro de build, même clé fixe que la CI) publié comme release GitHub (`pupitre-vX.Y.Z.apk`).
- Ce sont des versions de test signées « debug » ; la signature de publication (Play Store / F-Droid) reste à faire en phase 3.

### ADR-024 — « Partager vers » : plugin `@capgo/capacitor-share-target` — *Acceptée*
- **Besoin** : recevoir des partitions partagées depuis une autre application (mail, messagerie, Drive) : intents Android `SEND` (un fichier) et `SEND_MULTIPLE` (plusieurs), qui transmettent les fichiers dans `EXTRA_STREAM` et non dans l'URL de l'intent (que `@capacitor/app` ne lit que pour `VIEW`).
- **Options étudiées** : `send-intent` (Capacitor 7 au mieux, peu suivi) ; un petit plugin Java local dans `android/` ; **`@capgo/capacitor-share-target`** 8.x (licence MPL-2.0, compatible GPL ; Capacitor 8 ; publié le 2026-11-13, maintenu activement).
- **Décision** : `@capgo/capacitor-share-target`. Il gère les deux intents, **copie chaque fichier dans le cache de l'application** (le droit de lecture accordé par l'application d'origine ne dure pas) et donne son nom d'affichage et son type MIME ; ses copies de plus d'un jour sont effacées. **Démarrage à froid** : Capacitor transmet l'intent de lancement aux plugins à la création du pont, et le plugin garde l'événement `shareReceived` jusqu'à ce que l'interface s'y abonne ; **à chaud** (`launchMode singleTask`), il arrive par `onNewIntent`. Pas de code natif à maintenir.
- **Côté application** (`src/core/import/openWith.ts`) : lecture de chaque copie (`file://`), import, suppression de la copie ; un seul fichier → ouverture de la partition (comme « Ouvrir avec… »), plusieurs → bilan d'import. Les filtres d'intents `SEND` / `SEND_MULTIPLE` reprennent les types MIME du filtre `VIEW` (`.mscz` n'a pas de type MIME officiel : `octet-stream` et `zip` sont acceptés, le contenu est vérifié à l'import).
- **À vérifier** : build Gradle par la CI (pas de SDK Android en local) et essai sur téléphone.

### ADR-025 — Cache disque des pages rendues ; ouverture des gros conducteurs — *Acceptée*
- **Constat** (Chromium headless, e2e `performance.mjs`) : ouvrir Toccata (7 parties, 1,6 Mo de MusicXML) prend ≈ 3,6 s, dont ≈ 1,1 s de démarrage de Verovio (compilation du WASM dans le worker), ≈ 0,8 s de chargement et mise en page, ≈ 0,2 s de préparation du XML (4 analyses DOM et 3 sérialisations).
- **Décision 1 — cache disque** (`src/core/render/renderCache.ts`, dossier cache de l'application) : pour un **XML affiché** et un **jeu d'options Verovio** donnés, on garde la mise en page (nombre de pages, identifiants des mesures, page de chaque mesure) et le SVG de chaque page déjà rendue. La **clé** est un SHA-256 du XML affiché (parties, silences regroupés, noms… y sont déjà), de **l'objet d'options Verovio entier** (JSON à clés triées : toute nouvelle option, police musicale comprise, entre automatiquement dans la clé) et des versions de Verovio et de l'application. Taille limitée à 64 Mo, entrées les moins récemment utilisées évincées d'abord ; index JSON écrit en différé (et au passage en arrière-plan). Paramètres → Stockage affiche l'espace utilisé et vide le cache.
- Sur une partition déjà vue avec les mêmes réglages, **Verovio n'est pas chargé** pour afficher : mise en page et pages viennent du disque ; le worker ne charge la partition que pour une page absente du cache ou un élément inconnu. Pour que ces pages se mélangent sans souci avec celles d'un worker neuf, les identifiants Verovio sont rendus **déterministes** (`xmlIdSeed`, sinon ils sont aléatoires à chaque chargement).
- **Décision 2** : le XML affiché est préparé en **une seule analyse DOM et au plus une sérialisation** (filtrage des parties, silences multi-mesures et noms sur le même document ; XML d'origine rendu tel quel s'il n'y a rien à changer).
- **Décision 3** : le worker Verovio est **démarré dès l'ouverture** de la visualisation, en parallèle de la lecture des fichiers et de la préparation du XML.
- **Résultats** (e2e, PC) : préparation du XML ≈ 190 → 70 ms ; première ouverture de Toccata ≈ 3,6 → 2,8 s ; **réouverture ≈ 2,9 → 0,85 s** (medley 5 parties : 3,0 → 2,1 s, puis 2,4 → 0,75 s). Mémoire : les workers de rendu (visualisation, pré-chargement de setlist) et d'import sont bien terminés en quittant la visualisation ou la setlist (vérifié par l'e2e).
- **Pistes suivantes** : compiler le WASM de Verovio une seule fois (aujourd'hui ≈ 1 s par worker) ; mesures sur un téléphone modeste.

## Questions encore ouvertes

3. **Téléphone ou tablette en priorité** pour les tests et l'ergonomie Android ? Par défaut, les deux sont prévus, avec le téléphone en priorité.
4. **Pédalier Bluetooth** : le porteur n'en a pas ; faut-il en emprunter un avant la v1, ou se contenter d'un clavier Bluetooth pour valider la réception des touches dans la WebView ?
6. **Langue de la documentation et du code** : documentation en français, code et commentaires en anglais (appliqué depuis la phase 1).
