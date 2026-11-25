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
| « Ouvrir avec… » | ⬜ non testé | Intent `VIEW` déclaré et géré, jamais essayé sur le téléphone. |
| Mode Continu | ⬜ non testé | Ajouté après ce test. Points à surveiller : fluidité du défilement automatique, défilement natif au doigt, pincement (geste `pan-y`), ancrage de la position. |
| Mémoire du worker de pré-chargement | ⬜ non testé | En setlist, un second worker Verovio prépare le morceau suivant : mémoire à mesurer sur un appareil modeste et avec de gros conducteurs. |

## À tester au prochain essai

1. Mode Continu : défilement au doigt, « suivant » au tap / clavier, défilement automatique (ligne de lecture), reprises, zoom (position conservée), verrouillage.
2. « Ouvrir avec… » depuis un gestionnaire de fichiers et depuis une pièce jointe de messagerie.
3. Préférence ♯/♭ de la transposition (ex. +1 demi-ton depuis Do : Ré♭ ou Do♯).
4. Pédalier Bluetooth (si un pédalier ou un clavier Bluetooth est disponible) : page suivante/précédente, lecture/pause, métronome, morceau suivant/précédent.
5. Mesures : temps d'import et d'ouverture, mémoire (Android Studio → Profiler, ou `adb shell dumpsys meminfo`) avec et sans pré-chargement.
