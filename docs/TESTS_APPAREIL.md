# Tests sur appareil

Retours du porteur du projet sur un vrai téléphone Android, avec l'APK de debug produit par la CI (voir [README](../README.md#installer-lapk-sur-un-téléphone)). Les tests automatiques (Vitest, scripts `e2e/` dans Chromium headless en émulation Pixel 7) ne remplacent pas ces essais : WebView Android, Bluetooth, sélecteur de fichiers et mémoire réelle ne s'y voient pas.

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
