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
8. **Dossiers** (ADR-029) : « + » → les deux boutons (Importer, Nouveau dossier) se touchent facilement ; créer des dossiers imbriqués, y entrer et **remonter avec le bouton retour d'Android** (un niveau à la fois, puis sortie de l'application à la racine) ; importer depuis un dossier ; **appui long** sur une partition (sélection, sans menu ni sélection de texte Android ; le glissement de la ligne marche encore) puis « Déplacer » ; « Déplacer vers… » depuis le menu ⋮ et par glissement ; **« Ouvrir avec… » / « Partager vers »** pendant qu'un dossier est affiché → la partition va dans ce dossier ; depuis la visualisation → à la racine ; la bibliothèque existante est bien migrée (rien ne disparaît après la mise à jour). **Couleur** : fenêtre « Nouveau dossier » (le clavier ne cache ni le champ ni le bouton Créer), « Couleur… » du menu ⋮, icônes lisibles en thème clair et sombre (le jaune surtout), avec TalkBack : nom de chaque pastille et état « activé » de la couleur courante.

## Métronome et son pas synchronisés (2026-11-28) — corrigé, à retester

**Retour** (téléphone Android, son de la partition activé) : les clics du métronome et la musique ne sont pas bien synchronisés.

**Cause** (mesurée dans Chromium headless, ADR-026, complément du 2026-11-28) : le métronome (oscillateurs Web Audio) était à l'heure, mais **le synthétiseur jouait chaque note en retard**, d'environ 260 ms sur PC : son horloge interne prenait du retard sur celle de l'`AudioContext` à chaque fois que le fil audio était bloqué (chargement de la banque de sons, décodage des échantillons, téléphone chargé). Sur un téléphone, le retard est sans doute plus grand et peut grandir pendant la lecture (à chaque craquement). Le surlignage de la mesure était donc lui aussi en avance sur le son.

**Correction** : l'horloge du synthétiseur est recalée sur celle de l'`AudioContext` à chaque bloc audio ; et, **son activé, le métronome est joué par le synthétiseur** (Wood Block aigu au premier temps, grave aux autres, sur un canal de batterie dédié), dans la même file et à la même heure que les notes : clic et note du même temps démarrent ensemble (écart mesuré : 1 ms ; avant : ≈ 260 ms). Son coupé (défilement silencieux, « métronome seul ») : le clic habituel reste. Le mixeur a une ligne **« Métronome »** : volume (par défaut celui des Paramètres, mémorisé par partition), bouton muet = métronome coupé ; le solo d'une partie ne coupe pas le métronome.

**À retester sur le téléphone** :
1. Son activé + métronome, ▶ : clics et musique **ensemble** du décompte à la fin (écouter les notes au premier temps, la batterie) ; le **point de pulsation** et le surlignage de la mesure tombent-ils sur ce qu'on entend ?
2. Même chose à **tempo 50 % et 150 %**, après **« aller à »** et un **appui long** sur une mesure pendant la lecture, après **pause / reprise**, sur une partition avec **reprises** et **changements de mesure** (6/8 : clic à la noire pointée).
3. Longue lecture (plusieurs minutes, gros conducteur comme Toccata) : l'écart ne doit **plus grandir** avec le temps, même s'il y a des craquements.
4. **Couper / remettre le métronome** pendant la lecture (bouton de la barre et ligne « Métronome » du mixeur) : il s'arrête net (au plus un clic déjà parti), repart au bon temps.
5. Mixeur : **volume du métronome** (le son des clics est-il bien dosé face à la musique, à 70 % par défaut ?), **solo** d'une partie (le métronome reste), « Moi seul » + métronome.
6. Son coupé : défilement avec métronome et **métronome seul** (appui long) : clic Web Audio comme avant, point de pulsation aligné.
7. Casque Bluetooth : clics et musique restent ensemble (même chemin) ; seul l'écart avec l'écran dépend de la latence annoncée par le casque.

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

## Armures manquantes (2026-11-28, corrigé en v0.8.1)

- **Signalement** : « il manque les armures ».
- **Cause** : MuseScore ≥ 4.4 écrit les armures sous la forme `<KeySig><concertKey>…</concertKey><actualKey>…</actualKey>`, que le moteur MuseScore 4.0 de webmscore ne lit pas : **toutes les armures devenaient Do majeur** pour les fichiers 4.4 à 4.7 (Motorcrypt 4.7.5 en La♭, medley 4.5 et unity 4.6 en Sol pour les instruments en Si♭). Les fichiers MuseScore 2/3 (`<accidental>`) n'étaient pas touchés.
- **Correctif** : avant conversion, les armures sont réécrites au format ancien (`<accidental>` = armure écrite de la portée : `actualKey` pour un instrument transpositeur, sinon `concertKey`) — `convertKeySignatures` dans `src/core/import/unhideParts.ts`, testé. Version d'import 4 : les partitions déjà importées sont **réimportées automatiquement** au premier lancement.
- **Vérifié** : export webmscore (Motorcrypt : sax alto −1, trompette −2, trombone −4… ; medley/unity : 1 ♯) et rendu dans l'application (24 altérations d'armure sur la page 1 de Motorcrypt).
- **À revérifier sur le téléphone** : après la mise à jour, laisser la réimportation se terminer, puis contrôler l'armure de quelques partitions récentes.

## Stay With Me : voix qui continue, glissandos bizarres, solo trompette, décompte trop rapide (2026-11-28) — corrigé, à retester

**Signalement** (téléphone, `test-scores/Stay_With_Me.mscz`, arrangement pour brass band avec une intro « chantée ») :
1. « La voix continue même quand on revient aux instruments. »
2. « Les glissandos sont très bizarres. »
3. « Quand je mets la trompette en solo, j'entends encore le sousaphone. »
4. « Le décompte est beaucoup trop rapide, pas au tempo du morceau. »

**Analyse** (`spikes/s8-audio-debug/` : MIDI exporté comme à l'import, analysé piste par piste, comparé au `.mscx`) :
- La partition utilise **19 canaux MuseScore** : trompette et trombone ont chacun « ouvert » + « sourdine », et les trompette, trombone, euphonium et sousaphone ont un **changement d'instrument « Voix »** (Chœur « Aah », programme 52) dans l'intro, puis reviennent à leur instrument sur un nouveau canal. Au-delà de 16, **webmscore (MuseScore 4.0) écrit le canal modulo 16 et toujours le port 0** (`FF 21 00`) : les canaux 16, 17, 18 deviennent 0, 1, 2, déjà pris par le sax alto, le sax baryton et la trompette.
- **Bug 1 (la voix)** : le canal 1 recevait le programme du sax baryton (67) **puis celui de la « Voix » du sousaphone (52)** : le **sax baryton jouait tout le morceau avec un son de chœur** (et le sax alto avec le son d'euphonium du canal 0). S'y ajoutaient des **notes pendantes** (ci-dessous) qui continuaient des dizaines de secondes.
- **Bug 2 (glissandos)** : MuseScore écrit chaque pas de glissando (sousaphone : gamme chromatique ; trombone : pitch bend) sous la forme « note on, note off, note on » au même instant (une note de durée nulle puis la vraie). Notre lecteur MIDI triait **toutes les note off en premier** à un instant donné (pour les portées de piano qui partagent un canal) : « off, on, on » → **deux voix pour une seule note off** ; spessasynth relâche une voix par note off (la plus ancienne), l'autre **restait jouée** (jusqu'à 55 s pour le sousaphone, 100 s pour le trombone), en plus doublée en volume. Glissando « bizarre » = nuage de notes tenues. Le pitch bend, lui, revenait bien au centre dans le fichier (plage ±12 demi-tons réglée par RPN au début, rejouée au démarrage).
- **Bug 3 (solo)** : les notes du sousaphone étaient sur le canal 2 (son canal 18 écrit modulo 16), qui est aussi un canal de la trompette : en solo trompette, le canal 2 restait ouvert.
- **Bug 4 (décompte)** : le morceau commence par une **levée d'un temps** (mesure 0, 536 ms en 4/4 à 112). Le décompte divisait la durée de la première mesure par 4 : **4 clics en 536 ms** (134 ms d'écart, 4 fois trop vite).

**Corrections** :
- **Un jeu de canaux par partie** (`src/core/audio/midiChannels.ts`) : à l'import, le fichier MIDI est réécrit pour qu'aucun canal ne soit partagé par deux parties ; le premier propriétaire garde le sien, les autres prennent des canaux libres (au-delà de 16 : ports MIDI, que spessasynth gère) ; les canaux de batterie restent des canaux de batterie et un canal mélodique ne tombe jamais sur un canal 10. Stay With Me : euphonium 6, 15, **16** ; sousaphone 7, **17, 18**. Le solo, le muet et les programmes sont donc exacts par partie.
- **Notes sûres** (`normalizeNotes`, `src/core/audio/midiFile.ts`) : note on / note off appariées dans l'ordre du fichier par piste, canal et touche ; notes de durée nulle et note off orphelines ignorées ; notes qui se chevauchent sur un canal fusionnées (rejouée, relâchée une fois) ; une note jamais relâchée s'arrête à la fin. Plus aucune voix pendante ni doublée.
- **Arrêt / pause / saut** : sur tous les canaux, pédale relâchée (CC 64), all notes off, all sound off, « reset all controllers » et **pitch bend recentré** (un glissando coupé ne désaccorde plus la suite).
- **Décompte et levées** : la timeline note les **mesures incomplètes** (longueur réelle lue dans le MusicXML). Le temps du métronome est celui du tempo ; une **levée compte ses temps depuis sa fin** (levée d'un temps en 4/4 = un clic, sur le 4e temps, aligné sur la musique) ; les autres mesures courtes (fin de morceau, première moitié d'une mesure coupée par une reprise) depuis leur début. Le **décompte** est fait de N mesures entières au tempo, sur la même grille, **plus les temps qui manquent à la levée** : levée d'un temps, décompte d'une mesure = « 1 2 3 4 | 1 2 3 », puis la levée sur 4. Même chose pour les clics du synthétiseur, de l'oscillateur et le point de pulsation. (Le medley avait aussi une mesure de 3 temps en 4/4 : 3 clics au tempo au lieu de 4 serrés.)
- `IMPORTER_VERSION` passe à **5** : les partitions sont **réimportées automatiquement**.
- **Tests** : unitaires (`midiSafety.test.ts` : glissandos, chevauchements, canaux partagés et solo, arrêt ; `playback.test.ts` et `metronome.test.ts` : levées de 1 et 2 temps en 4/4, levée en 6/8, levée d'une croche, mesure courte) ; e2e `e2e/audio-stay-with-me.mjs` (ignoré sans le fichier) : décompte à 536 ms, aucune note sur les canaux « Voix » mesure 28, sax baryton avec son programme, aucune note pendante, glissandos du trombone recentrés, pause qui recentre tout, solo trompette mesure 16 = silence (le sousaphone y joue seul).

**À retester sur le téléphone** (laisser la réimportation se terminer après la mise à jour) :
1. Stay With Me, son activé, du début : la **voix** (chœur) ne s'entend que dans l'intro ; ensuite plus de « aah » ; le sax baryton sonne comme un sax.
2. **Glissandos** du trombone et du sousaphone (vers 1 min 43 – 1 min 47, mesures 43–45) : un glissement propre, sans notes qui restent tenues ensuite ; la note suivante est juste.
3. **Solo trompette** : plus de sousaphone ; essayer aussi solo sousaphone, euphonium, sax alto (chaque partie seule), et « Moi seul ».
4. **Décompte** : au tempo du morceau (« 1 2 3 4 | 1 2 3 », puis la levée) ; métronome activé : un clic sur la levée (4e temps), puis les temps de la mesure 1 avec la musique ; à 50 % et 150 %.
5. Pause au milieu d'un glissando puis reprise ou « aller à » : rien ne reste désaccordé ni tenu.
6. Les autres partitions (medley, Toccata, Motorcrypt) sonnent comme avant.
