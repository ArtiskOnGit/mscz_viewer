# Spikes de la phase 0

Code jetable qui valide les choix techniques. Résultats : [docs/spikes/PHASE0_RESULTATS.md](../docs/spikes/PHASE0_RESULTATS.md).

> **Archive de la phase 0 (close le 2026-11-25).** L'application elle-même (dossier `src/` à la racine) a remplacé ce banc de test : pour essayer sur un téléphone, installer l'APK de debug produit par la CI (voir le [README](../README.md#installer-lapk-sur-un-téléphone)) ; retours dans [docs/TESTS_APPAREIL.md](../docs/TESTS_APPAREIL.md). Ces scripts restent utiles pour interroger webmscore ou Verovio hors de l'application (ex. `node s2-verovio/run.mjs … --transpose=m2`).

Les partitions de test vont dans `../test-scores/`. Ce dossier est **ignoré par git** : n'y mettez que des fichiers à vous ou dont vous avez le droit d'usage. Tous les dossiers `out/` (sorties générées) sont ignorés aussi.

## Installation

```bash
cd spikes
npm install        # copie aussi les fichiers de webmscore dans device-test/public/
```

## Scripts

| Commande | Spike | Rôle |
|---|---|---|
| `npm run s1` | S1 | Charge chaque `.mscz` de `../test-scores/` avec webmscore. Exporte dans `s1-webmscore/out/<nom>/` : MusicXML, métadonnées, positions des mesures, SVG/PNG page 1, MIDI. Si un fichier plante, relancer chaque fichier séparément (une erreur WASM rend l'instance inutilisable). |
| `node s2-verovio/run.mjs s1-webmscore/out/<nom> [--parts=P2] [--transpose=+2] [--scale=55] [--tag=x]` | S2/S4 | Rendu Verovio à la taille d'un écran de téléphone, avec timemap et mesures de temps. |
| `node s3-timeline/compare.mjs s1-webmscore/out/<nom>` | S3 | Compare la timeline MuseScore et celle de Verovio. |
| `node s3-timeline/filter-parts.mjs <in.musicxml> P2,P3 <out.musicxml>` | S3 | Filtre les parties en recopiant les tempos et repères. |
| `node device-test/e2e.mjs ../test-scores/<fichier>.mscz` | S1–S6 | Lance le banc de test dans Chromium headless (émulation Pixel 7). Nécessite `npx playwright install chromium`. |
| `npm run device` | S5/S6 | Sert le **banc de test** sur le réseau local, pour un vrai téléphone. |
| `for f in test-scores/*.mscz; do node spikes/s7-midi/compare.mjs "$f"; done` (depuis la racine de l'application) | S7 (2026-11-26, ADR-026) | MIDI de webmscore (`saveMidi(true, true)`) contre la timeline : pistes, canaux, parties, écart maximal début de mesure / note (≤ 0,71 ms sur le corpus). |
| `node spikes/s7-midi/multistaff.mjs` (depuis la racine) | S7 | Pistes MIDI d'une partie à deux portées et d'une batterie (une piste par portée, canaux partagés, batterie canal 10). |

## Tester sur un téléphone Android (S5, S6, performances réelles)

1. Le PC et le téléphone doivent être sur le **même réseau Wi-Fi**.
2. `npm run device`, puis noter l'adresse « Network » affichée (ex. `http://192.168.1.20:5173/`).
3. Sur le téléphone, ouvrir cette adresse dans **Chrome**. Le moteur de Chrome est celui de la WebView qu'utilisera Capacitor.
4. **Choose file**, puis un `.mscz` copié sur le téléphone.
5. À tester :
   - tourner les pages en touchant le tiers gauche ou droit de l'écran ;
   - **pédalier Bluetooth** (S5) : l'appairer, l'essayer, puis ouvrir **Stats** → `keys` liste les touches reçues (`code`) ;
   - **zoom** − / +, choix des **instruments**, **transposition**, **concert** ;
   - **▶** : défilement au tempo (mesure courante en rouge). **🥁** : clic du métronome. Faire varier le **%** pendant la lecture ;
   - **Stats** : relever `timings` (import, rendu, relayout, tournage de page), `metronome` (`late` doit rester à 0, `outputLatencyMs`) et `device`.
6. Me transmettre le contenu du panneau Stats (copier-coller ou capture d'écran) avec le modèle du téléphone.

Limites connues du banc de test (sans importance pour l'application finale) :
- **Wake Lock** (écran toujours allumé) : il exige HTTPS, donc échoue sur `http://IP`. Dans l'application, ce sera un plugin natif.
- Pas de décompte, pas de demi-page, pas de mode continu : le banc de test ne vérifie que les briques techniques.
