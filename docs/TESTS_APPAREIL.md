# Tests sur appareil

Retours du porteur du projet sur un vrai téléphone Android, avec l'APK de debug produit par la CI, et (depuis le 2026-11-27) sur iPhone avec l'application web (section en fin de document) (voir [README](../README.md#installer-lapk-sur-un-téléphone)). Les tests automatiques (Vitest, scripts `e2e/` dans Chromium headless en émulation Pixel 7) ne remplacent pas ces essais : WebView Android, Bluetooth, sélecteur de fichiers et mémoire réelle ne s'y voient pas.

## Retours de test sur appareil (2026-11-25)

Version testée : APK de debug de la phase 2, avant l'ajout du mode Continu.

| Domaine | Résultat | Détail |
|---|---|---|
| Installation de l'APK | ✅ | S'installe et se lance. La clé de debug fixe (ADR-016) permet d'installer les versions suivantes par-dessus. |
| Import | ✅ | L'import depuis le sélecteur de fichiers fonctionne. |
| Rendu des parties masquées | ✅ corrigé | **Bug trouvé sur le téléphone** : ligatures (*beams*) absentes sur les parties masquées dans MuseScore. Cause : MuseScore ne met pas en page les parties masquées, donc n'exporte pas leurs ligatures. Corrigé à l'import (parties rendues visibles avant conversion, `IMPORTER_VERSION` 2, réimport automatique des partitions déjà importées). |
| Appuis longs | ✅ | Métronome seul (appui long sur le bouton métronome) et déverrouillage (appui long sur le cadenas) fonctionnent. |
| Son du métronome seul | ✅ | Le clic Web Audio du « métronome seul » fonctionne sur le téléphone. Régularité et latence non mesurées. |
| Demi-page | ✅ | Rendu jugé bon (coupure entre deux systèmes). |
| Setlists | ✅ | Fonctionnent, enchaînement rapide (aucun ralentissement perçu ; pré-chargement du morceau suivant). |
| Pédalier Bluetooth | ⚠️ non testé | **Le porteur n'a pas de pédalier Bluetooth.** Seuls les événements clavier ont été testés (navigateur et e2e). La réception des touches d'un vrai pédalier dans la WebView Android reste à vérifier. |
| « Ouvrir avec… » | ✅ (2026-11-26) | Fonctionne sur le téléphone du porteur. |
| Mode Continu | ✅ (2026-11-26) | Testé sur le téléphone : « marche plutôt bien » selon le porteur. Retours plus fins bienvenus (fluidité du défilement automatique, pincement, reprises). |
| Préférence ♯/♭ (transposition) | ✅ (2026-11-26) | Fonctionne sur le téléphone du porteur. |
| Mémoire du worker de pré-chargement | ⬜ non testé | En setlist, un second worker Verovio prépare le morceau suivant : mémoire à mesurer sur un appareil modeste et avec de gros conducteurs. |

## À tester au prochain essai

1. **« Partager vers »** (ADR-024) : depuis la messagerie, le mail ou Drive, partager un `.mscz` → Pupitre doit apparaître dans la liste, importer puis ouvrir la partition ; partager plusieurs fichiers d'un coup → bilan d'import. Essayer application fermée (démarrage à froid) et ouverte en arrière-plan.
2. **Appui long sur une mesure** (0,5 s) en mode Pages et Continu : la mesure passe en bleu, ▶ part de là ; pendant la lecture, relance depuis la mesure touchée ; les taps courts gardent leur rôle (pas de menu contextuel Android).
3. **Cache de rendu** (ADR-025) : rouvrir un gros conducteur (Toccata) doit être nettement plus rapide la deuxième fois ; Paramètres → Stockage : espace utilisé et « Vider le cache de rendu ».
4. Pédalier Bluetooth (si un pédalier ou un clavier Bluetooth est disponible) : page suivante/précédente, lecture/pause, métronome, morceau suivant/précédent.
5. Mesures : temps d'import et d'ouverture (première fois et réouverture), mémoire (Android Studio → Profiler, ou `adb shell dumpsys meminfo`) avec et sans pré-chargement.
6. **Son de la partition** (ADR-026) : au premier lancement de la nouvelle version, les partitions sont réimportées (bandeau de mise à jour) ; ouvrir une partition, bouton haut-parleur → activer le son (temps de chargement ?), ▶ : le son commence après le décompte, **aligné** avec le surlignage (latence de sortie compensée : le surlignage paraît-il en avance ou en retard ?) ; tempo 50 % et 150 % ; reprises ; « aller à » et appui long pendant la lecture ; pause qui coupe net ; mixeur (muet, solo, volume, « Moi seul » / « Sans moi ») pendant la lecture ; métronome en même temps ; craquements sur un gros conducteur (Toccata) ; mémoire avec le son ; écran éteint / application en arrière-plan (la lecture se met en pause) ; casque Bluetooth (latence plus grande).
7. **Tempo** : sur téléphone en portrait, toucher la valeur du tempo ouvre la petite fenêtre (−/+, curseur, retour à 100 %).

## iPhone : application web (ADR-027) — à tester

Installation : README, « Installer sur iPhone ». Les tests automatiques passent dans **WebKit de Playwright avec le profil iPhone 14** (`e2e/pwa.mjs` : hors ligne, import, rendu, son), mais ce n'est **pas Safari iOS** : bouton silencieux, sélecteur de fichiers, mémoire, stockage et écran de l'iPhone ne s'y voient pas. Noter le modèle d'iPhone et la version d'iOS.

1. **Installation** : Safari → Partager → « Sur l'écran d'accueil » : icône (logo sur fond crème, coins arrondis par iOS), nom « Pupitre ». Ouverture depuis l'écran d'accueil **en plein écran**, sans barre de Safari.
2. **Téléchargement hors ligne** : Paramètres → Stockage → « Utilisation hors ligne » : la progression avance jusqu'à **« Prêt »** (≈ 42 Mo ; durée en Wi-Fi ?). Fermer l'application pendant le téléchargement puis la rouvrir : il reprend. « Stockage protégé » : accordé ou non ?
3. **Mode Avion** (après « Prêt ») : fermer complètement l'application (balayer), la rouvrir → la bibliothèque s'affiche ; **importer** une partition (bouton + → Fichiers : les `.mscz` sont-ils sélectionnables, pas grisés ? `.mscx`, `.mxl`, `.musicxml` aussi), l'**ouvrir**, activer le **son**, ▶ : on entend la partition et le métronome.
4. **Bouton silencieux** (sur le côté) en position silencieux : le son et le métronome doivent **rester audibles** (session audio « playback », iOS ≥ 16.4). Casque filaire / Bluetooth : latence et alignement du surlignage.
5. **Écran toujours allumé** pendant la lecture d'une partition (Wake Lock ; dans l'application installée, iOS 18.4 ou plus). Si le réglage n'apparaît pas dans Paramètres → Appareil, l'API manque sur cette version.
6. **Encoche et indicateur d'accueil** : en portrait et en **paysage**, les barres d'outils et la partition ne passent pas sous l'encoche / Dynamic Island ni sous la barre d'accueil ; idem en masquant les barres (tap au centre). Thème sombre : barre d'état lisible.
7. **Gestes** : tap gauche/droite, balayage, pincement pour zoomer, appui long sur une mesure (pas de loupe ni de menu iOS ?), mode Continu (défilement inertiel).
8. **Mémoire** : import puis ouverture d'un gros conducteur (Toccata), mode Continu, setlist avec pré-chargement : l'application se recharge-t-elle toute seule (page tuée par iOS) ?
9. **Persistance** : après plusieurs jours sans ouvrir l'application, les partitions et le mode hors ligne sont-ils toujours là ?
10. **Mise à jour** : après la publication d'une nouvelle version (tag `v*`), rouvrir l'application en ligne : message **« Nouvelle version disponible — Recharger »** ; après « Recharger », Paramètres → À propos affiche la nouvelle version et « Utilisation hors ligne » repasse à « Prêt ».
11. **Arrière-plan** : passer à une autre application pendant la lecture puis revenir (la lecture s'arrête-t-elle proprement ? le son revient-il ?).

### iPhone : page blanche sur un gros conducteur (2026-11-27) — corrigé, à retester

**Retour** : Safari (onglet, barre d'adresse visible), `Motorcrypt.mscz` (7 parties, toutes affichées) : la visualisation reste **entièrement blanche** à la page « 37 / 52 », alors que la lecture tourne (bouton pause, son actif, point de pulsation). Le « M » de la barre du haut est simplement le **titre de la partition** (« Motorcrypt »), tronqué faute de place sur un téléphone : comportement normal.

**Cause** (reproduite dans WebKit, profil iPhone 14, et dans Chromium) : quand la géométrie change puis revient avant la fin de la nouvelle mise en page (A → B → A : barre de Safari, rotation, zoom arrière puis zoom automatique…), la visualisation croyait être revenue à A et gardait la mise en page de A (52 pages), alors que le moteur de rendu était passé à B (8 pages en zoom arrière). La page 37 était demandée à Verovio dans la mise en page de B, où elle n'existe pas : Verovio répond un SVG vide (`viewBox="0 0 0 0"`), affiché comme une page blanche, sans aucune erreur. Un gros conducteur (mise en page longue, plus encore sur iPhone) élargit la fenêtre du problème. Un second défaut pouvait écrire dans le cache disque une page dessinée depuis une autre mise en page.

**Correction** (ADR-025, complément) : visualisation et moteur de rendu toujours d'accord sur la mise en page ; chaque page dessinée depuis la mise en page de sa demande ; page vide ou inexistante traitée comme une erreur ; message « Cette page n'a pas pu être dessinée » + **Réessayer** (ou « prend trop de temps » après 30 s) au lieu d'une page blanche ; sablier pendant le dessin ; format du cache de rendu passé à 2 (les pages déjà en cache sur l'iPhone sont redessinées). Test de non-régression : `e2e/render-race.mjs` (Chromium Pixel 7 + WebKit iPhone 14, nécessite `test-scores/Motorcrypt.mscz`) et tests unitaires `renderService.race.test.ts`, `pieceData.test.ts`.

**À retester sur l'iPhone** (après mise à jour : « Nouvelle version disponible — Recharger ») : ouvrir Motorcrypt dans Safari **et** depuis l'écran d'accueil, aller page 37, zoomer / dézoomer / « Zoom automatique », tourner le téléphone en paysage puis en portrait, faire défiler pour que la barre de Safari se réduise / réapparaisse, lancer la lecture avec le son depuis une page tardive : la partition doit rester dessinée. Si un message « Cette page n'a pas pu être dessinée » apparaît, noter la page, essayer « Réessayer » et le signaler (ce n'est plus silencieux).
