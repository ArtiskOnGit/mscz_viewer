# Journal des décisions (ADR) et questions ouvertes

Format : chaque décision a un statut **Proposée** (en attente), **Acceptée**, **Acceptée sous réserve de spike** (à confirmer en phase 0), **Remplacée** ou **Rejetée**.

## Réponses du porteur du projet (2026-11-25)

| Question | Réponse | Conséquence |
|---|---|---|
| Plateforme prioritaire | **Android d'abord** | Phases 1 et 2 sur Android ; iOS en phase 3 |
| Publication | **Sur les stores, à terme** | La question GPL / App Store doit être réglée avant la publication iOS (ADR-005) |
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
- **Résultat de S1** : les fichiers **2.1, 4.5.2 et 4.6.2** du corpus se chargent. `savePositions(true)` plante et corrompt l'instance WASM. Règle : **un worker neuf par import**, positions des mesures seulement. Il reste à tester un fichier 3.x et à mesurer les temps sur téléphone.
- **Plans B** : a) recompiler webmscore sur un MuseScore récent ; b) convertisseur `.mscx` → MusicXML maison ; c) demander un export MusicXML (toujours pris en charge).

### ADR-002 — Rendu : Verovio sur MusicXML, mise en page adaptée à l'écran — *Acceptée* (S2 et S4 validés le 2026-11-25)
- **Décision** : **Verovio** (LGPL-3.0), toujours avec une **mise en page recalculée pour l'écran** (`breaks: 'auto'`). Les sauts de page et de système d'origine ne sont pas reproduits.
- **Non retenu** : le mode « mise en page d'origine » (SVG de webmscore). Il reste seulement un plan B technique si la qualité de Verovio est insuffisante.

### ADR-003 — Licence de l'application : GPL-3.0-or-later — *Acceptée*
- Imposée par webmscore. Le code est publié dans un dépôt public. Verovio (LGPL), les polices (OFL) et les dépendances MIT/BSD sont compatibles.

### ADR-004 — Framework : Capacitor + Ionic **React** + TypeScript — *Acceptée*
- **Critère du porteur** : le plus simple et le plus multiplateforme.
- **Pourquoi React plutôt que Svelte** : Ionic ne propose officiellement que Angular, React et Vue, donc pas Svelte. React a le plus de documentation, d'exemples et de bibliothèques. Capacitor fournit Android, iOS et le web à partir de la même base.

### ADR-005 — Distribution — *Acceptée pour Android ; iOS à trancher en phase 3*
- **Android** : APK direct (GitHub Releases), puis **F-Droid** et **Google Play**. La GPL ne pose pas de problème sur ces canaux.
- **iOS / App Store** : la compatibilité de la GPL avec les conditions de l'App Store est contestée. Une plainte d'un ayant droit de MuseScore pourrait faire retirer l'application. Options à étudier **avant la phase 3** :
  1. publier quand même (risque accepté ; d'autres applications GPL y sont publiées) ;
  2. demander une autorisation écrite ou une exception à Muse Group (détenteur principal des droits) ;
  3. publier sur iOS une variante **sans webmscore** (import MusicXML seulement, voire un convertisseur `.mscx` maison sous licence permissive).
- Exigence commune : le pipeline d'import reste isolé derrière une interface (`ScoreImporter`) pour pouvoir remplacer webmscore sans toucher au reste.

### ADR-006 — Nom de l'application — *Proposée*
- Nom de travail : **« Pupitre »** (français pour « music stand »). L'application est d'abord en anglais : on peut garder ce nom comme marque, ou choisir un nom anglais.
- À vérifier : disponibilité sur Google Play et F-Droid, absence de marque déposée. Le nom ne doit pas contenir « MuseScore ».

### ADR-007 — Stockage : fichiers + index JSON — *Acceptée*
- Index `library.json` et `setlists.json`, fichiers dans l'espace privé de l'application, derrière les interfaces `LibraryRepository` et `SetlistRepository`. Passage à SQLite si le volume ou la recherche le demandent.

### ADR-008 — Timeline du défilement et du métronome — *Acceptée* (S3 validé le 2026-11-25)
- Positions MuseScore (webmscore) à l'import pour les `.mscz`, avec reprises dépliées et changements de tempo. Timemap Verovio pour le MusicXML.
- La timeline contient aussi la **métrique de chaque mesure** (nombre de temps, unité), dont le métronome a besoin.
- **Résultat de S3** : l'ordre de jeu est identique entre MuseScore et Verovio (en retirant les suffixes `-rendN` de Verovio). Le filtrage des parties doit **recopier les tempos et repères** de la première partie (ADR-012).

### ADR-009 — Internationalisation : anglais d'abord, i18n dès le départ — *Acceptée*
- Langue de référence de l'interface : **anglais**. Le français sera la première traduction ajoutée.
- **i18next + react-i18next**. **Aucune chaîne en dur** dans les composants, ce qui est vérifié par une règle de lint (`eslint-plugin-i18next`).
- Clés structurées par écran (`library.import.button`), pluriels ICU, formats de date et de nombre via `Intl`.
- Noms de notes et de tonalités localisables : *C/D/E* en anglais, *Do/Ré/Mi* en français, et un réglage « notation des notes » indépendant de la langue.
- Interface prête pour les langues de droite à gauche (CSS logique : `margin-inline-start`…), sans en faire une priorité.
- La documentation du projet reste en français pour l'instant.

### ADR-010 — Pas de lecture audio ; métronome optionnel — *Acceptée*
- **Pas de synthèse audio** de la partition : pas de SoundFont, et pas de `synthAudio` de webmscore.
- **Métronome optionnel** : clic généré avec Web Audio (oscillateur, aucun fichier son), calé sur le tempo de la partition, ses changements de tempo et de métrique, et le facteur de tempo. Il est utilisable **pendant le défilement automatique** ou **seul**.
- iOS (phase 3) : Web Audio est coupé par le bouton silencieux. On le signalera dans l'interface, ou on passera par une session audio native si nécessaire.

### ADR-011 — Setlists dans la v1 — *Acceptée*
- Les setlists (programmes de répétition ou de concert) font partie de la v1, et sont prévues en phase 2.
- Une entrée de setlist pointe vers une partition. Elle utilise les réglages mémorisés de la partition (instruments, transposition, zoom), avec une **surcharge optionnelle** propre à l'entrée (en v1 : instruments et transposition).

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

## Questions encore ouvertes

1. **Nom de l'application** (ADR-006).
2. **Stratégie iOS / App Store** (ADR-005) : à trancher avant la phase 3.
3. **Téléphone ou tablette en priorité** pour les tests et l'ergonomie Android ? Par défaut, les deux sont prévus, avec le téléphone en priorité.
4. **Langue de la documentation et du code** : documentation en français, code et commentaires en anglais (proposé).
