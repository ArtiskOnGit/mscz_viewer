# Spécifications fonctionnelles

> Nom de travail de l'application : **Pupitre** (provisoire, voir [DECISIONS.md](DECISIONS.md)).
>
> **Langue de l'interface : anglais d'abord**, internationalisation prévue dès le départ (ADR-009). Les libellés de ce document sont en français pour la lisibilité ; dans l'application, ils sont en anglais (ex. « Importer » → *Import*).
>
> **État au 2026-11-25 (fin de la phase 2)** : chaque fonction est marquée ✅ fait, 🟨 partiel, ⬜ pas fait (phase prévue entre parenthèses), ✏️ **écart** avec la spécification d'origine (ce qui a été construit diffère, et pourquoi). Essais sur téléphone : [TESTS_APPAREIL.md](TESTS_APPAREIL.md).

## 1. Vision

Un **lecteur de partitions MuseScore pour musiciens en répétition**. Il ne sert pas à éditer : il sert à **lire vite et bien** sur téléphone ou tablette posée sur un pupitre. On choisit son instrument, on transpose si besoin, on fait défiler à la main, au pédalier ou automatiquement au tempo. Tout fonctionne **sans connexion**.

### Utilisateurs cibles

- Musicien d'ensemble (harmonie, big band, orchestre, chorale) qui reçoit des `.mscz` du chef ou de l'arrangeur.
- Musicien qui joue d'un instrument transpositeur (Sib, Mib, Fa) et veut sa partie dans la bonne tonalité.
- Chef ou répétiteur qui veut voir le conducteur ou quelques pupitres à la fois.

### Principes d'ergonomie (contexte de répétition)

1. **Mains souvent occupées** : grandes zones tactiles, tourne-page au **pédalier Bluetooth**, défilement automatique.
2. **Lecture à distance** (environ 60–80 cm) : zoom facile et mémorisé, mode sombre ou sépia, contraste élevé.
3. **Pas de mauvaise surprise** : l'écran ne se met jamais en veille pendant la lecture, mode « verrouillé » contre les touchers accidentels, aucune dépendance réseau.
4. **Réglages mémorisés par partition** : on rouvre la partition comme on l'a laissée (instruments, transposition, zoom, page, mode d'affichage, tempo, métronome).
5. **Interface qui s'efface** : un tap au centre masque les barres d'outils et la partition occupe tout l'écran. ✏️ Pas de masquage automatique après quelques secondes : on a préféré un geste explicite (une barre qui disparaît seule gêne quand on cherche un bouton).
6. **Mise en page adaptée à l'écran** : la musique est toujours remise en page pour l'écran de l'appareil. On ne reproduit pas les sauts de page du fichier d'origine (ADR-002).

## 2. Formats pris en charge

| Format | Import | Remarque |
|---|---|---|
| `.mscz` (MuseScore **2.x, 3.x, 4.x**) | ✅ | Format principal. 2.1, 3.6.2, 4.5.2 et 4.6.2 validés (phase 0, et import vérifié sur téléphone) |
| `.mscx` | ✅ | XML MuseScore non compressé |
| `.mxl`, `.musicxml`, `.xml` | ✅ | ✏️ Convertis par webmscore comme les `.mscz` (ADR-017). Conseillé quand un `.mscz` récent pose problème |
| `.mei` | ⬜ (phase 4) | Pris en charge nativement par Verovio |
| PDF, Guitar Pro | Hors périmètre (à réévaluer) | |

Les **parties masquées** dans MuseScore sont importées comme les autres (elles sont rendues visibles avant la conversion, sinon leurs ligatures manquent — ADR-018) et sont proposées dans la liste des instruments avec la mention *hidden in MuseScore*. Par défaut, seules les parties visibles dans MuseScore sont affichées.

## 3. Écrans

L'application a **trois écrans** principaux. La Bibliothèque a deux onglets, **Partitions** (*Scores*) et **Setlists**. Le reste se fait dans des fenêtres secondaires (modales).

```
┌─────────────────────────┐  tap partition / « Play »  ┌──────────────────┐
│  BIBLIOTHÈQUE           │ ─────────────────────────► │  VISUALISATION   │
│  [Scores|Setlists]      │ ◄───────────────────────── │  (+ navigation   │
└──────┬──────────────────┘          retour            │   dans setlist)  │
       │ ⚙                                             └────────┬─────────┘
       ▼                                                        ▼ modales
┌───────────────┐                                     ┌──────────────────────────┐
│  PARAMÈTRES   │                                     │ Instruments · Transposer │
└───────────────┘                                     │ · Aller à                │
                                                      └──────────────────────────┘
```

### 3.1 Écran Bibliothèque (choix de la partition)

**Contenu**
- ✅ Liste des partitions importées. Chaque ligne montre : **miniature** (page 1), **titre**, compositeur, nombre d'instruments, durée. ✏️ Pas de vue en grille ni de date de dernière ouverture affichée (le tri « Recently opened » en tient lieu).
- ✅ **Bouton « Import »** (bouton flottant « + ») qui ouvre le sélecteur de fichiers du système, avec **sélection multiple**.
- ✅ **Recherche** par titre ou compositeur.
- ✅ **Tri** : dernière ouverture (par défaut), titre, compositeur, date d'import.

**Actions sur une partition** (glissement de la ligne)
- ✅ Ouvrir (tap).
- ✅ Renommer (titre affiché uniquement, le fichier n'est pas modifié ; vide = titre d'origine).
- ✅ Informations : métadonnées, version de MuseScore d'origine, instruments (avec les parties masquées), tempo initial, nombre de mesures, durée, marques de répétition, dates.
- ✅ Réinitialiser les réglages d'affichage de cette partition (depuis les informations).
- ✅ Supprimer (avec confirmation ; retirée aussi des setlists, avec la liste des setlists concernées).
- ✏️ **Ajouter à une setlist** : se fait depuis la setlist (« Add scores »), pas depuis la bibliothèque.
- ⬜ *(phase 4)* Étiquettes, partager le fichier d'origine.

**Import**
- ✅ Depuis le bouton « Import » (sélecteur de fichiers : stockage local, Google Drive…).
- 🟨 **« Ouvrir avec… »** (Android, intent `VIEW`) : la partition est importée puis ouverte. Fait, **pas encore essayé sur téléphone**. ⬜ « Partager vers… » (intent `SEND`, phase 3).
- ✅ Progression (« Importing x (2/5)… ») et bilan (importées, déjà présentes, en échec). Un fichier en échec affiche un message clair avec un conseil (exporter en MusicXML depuis MuseScore).
- ✅ **Doublons** : un fichier identique (même empreinte SHA-256) n'est pas réimporté. ⬜ « Même titre, contenu différent → Remplacer / Garder les deux » : pas fait (les deux sont gardés).
- ✅ **Mise à jour automatique** : quand le pipeline d'import change, les partitions déjà importées sont réimportées depuis leur fichier d'origine au démarrage, avec un message de progression (ADR-018).

**État vide** : ✅ texte d'aide et bouton Import.

### 3.2 Écran Visualisation

Plein écran. La partition occupe tout l'espace, entre une barre d'outils en haut et une barre de navigation en bas. Un tap au centre masque ou affiche les deux barres.

#### Barre d'outils (haut) — telle que construite
`← Retour` · Titre · `🔒 Verrouiller` · `👥 Instruments (n/N)` · `📄/≡ Pages ⇄ Continu` · `♯♭ Transposer (+2)` · `− Zoom` · `Zoom auto` · `+ Zoom`

#### Barre de navigation (bas) — telle que construite
`◀ Précédent` · `▶/⏸ Défilement` · `⊖ tempo % ⊕` · `⏱ Métronome` · `Page 3 / 12` · `🧭 Aller à` · `▶ Suivant`
En mode setlist, un bandeau au-dessus : `◀ morceau précédent` · « 2/6 · Next: titre » · `morceau suivant ▶`.

✏️ Écarts : pas de menu « ⋮ Plus », pas de curseur de position ni de boutons `⏮ ⏭` début/fin.

#### 3.2.1 Choix des instruments
- ✅ Fenêtre avec la **liste des instruments** du fichier (nom, nombre de portées, mention des parties masquées dans MuseScore).
- ✅ **Sélection multiple** par cases à cocher, plus « Tous (conducteur) ». ⬜ « Aucun sauf… », « Inverser ».
- ✅ **« My instrument »** : si l'utilisateur a défini son instrument dans les paramètres, la partie correspondante est **présélectionnée** à la première ouverture (message « Showing your part: … »).
- ✅ L'ordre des portées suit l'ordre de la partition. Noms d'instruments masqués quand une seule partie est affichée (réglable).
- ✅ La sélection est mémorisée pour chaque partition (ou dans l'entrée de setlist en mode setlist).
- ⬜ *(phase 4)* Combinaisons nommées (« Cuivres », « Section rythmique »).

#### 3.2.2 Changement de page / défilement manuel
Deux **modes d'affichage**, qu'on change avec le bouton de la barre d'outils (mémorisé par partition) ; le mode des partitions ouvertes pour la première fois se règle dans les paramètres.

| Mode | Description | Navigation |
|---|---|---|
| ✅ **Pages** (par défaut) | Pages à la taille de l'écran, mise en page recalculée pour l'écran | Balayage horizontal, **zones de tap** (tiers gauche = page précédente, tiers droit = page suivante), pédalier/clavier, boutons |
| ✅ **Continu** | Partition en un seul rouleau vertical (pages de même largeur empilées, sans blanc en bas de page) | Défilement natif au doigt ; pédalier/clavier, boutons, **taps latéraux** et balayage horizontal = **environ un écran** (85 %, le reste se recouvre) ; tap au centre = barres d'outils ; défilement automatique |

Options de navigation :
- ✅ **Demi-page** (mode Pages, option) : à la page suivante, on remplace d'abord le haut de l'écran par le haut de la page suivante, avec une coupure **entre deux systèmes** (jamais à travers une portée) et un trait pointillé. Le défilement automatique tourne des pages entières.
- ⬜ **Deux pages côte à côte** sur tablette en paysage (phase 3).
- ✅ **Pédalier Bluetooth / clavier** : la plupart des pédaliers envoient des touches clavier (flèches, Page suivante/précédente, Espace, Entrée). Les touches sont configurables dans les paramètres (voir §3.4). ⚠️ Jamais essayé avec un vrai pédalier.
- ✅ **Aller à la mesure n°** (numéro imprimé, ou rang) ou à une **marque de répétition** (A, B, C…). Le prochain ▶ part de cette mesure.
- ✏️ Pas d'animation de tournage (tournage instantané) ; en mode Continu, « suivant » fait un défilement doux.

#### 3.2.3 Zoom
- ✅ **Pincement** à deux doigts, boutons `−` / `+` (pas de 15 %) et « zoom automatique » (dépend du nombre de portées affichées). ⬜ Préréglages 75 %…200 %.
- ✅ Le zoom **recalcule la mise en page** (pas de simple agrandissement d'image). En mode Pages, on reste sur la même musique ; en mode Continu, la première mesure à l'écran reste en haut.
- ✅ Zoom mémorisé pour chaque partition. ⬜ Par orientation (phase 4).

#### 3.2.4 Transposition
- ✅ Demi-tons (−11…+11) et **octave** (−2…+2), plus des préréglages « instrument en Sib / Mib / Fa ». ✏️ Pas de choix direct d'une tonalité cible : on règle les demi-tons et la tonalité résultante s'affiche.
- ✅ Affiche la tonalité résultante (« C major → D major »), en notation anglaise.
- ✅ Bascule **« Concert pitch »** (hauteur réelle) pour les instruments transpositeurs.
- ✅ **Préférence d'altérations** (*Spelling of the key*) : Auto / ♯ / ♭, proposée quand la tonalité d'arrivée a un équivalent enharmonique (ex. +1 depuis Do : Ré♭ ou Do♯ ; Sol♭/Fa♯ ; Si/Do♭). Auto = le moins d'altérations (♭ en cas d'égalité). La tonalité affichée est exactement celle du rendu (ADR-020).
- 🟨 Les grilles d'accords sont transposées par Verovio (corpus sans grilles d'accords : non vérifié).
- ✅ Bouton « Reset ». La transposition est mémorisée pour chaque partition (ou dans l'entrée de setlist). Une transposition par défaut peut être appliquée à la première ouverture (profil, §3.4).

#### 3.2.5 Défilement automatique au tempo
- ✅ Bouton **▶ / ⏸** (aussi au pédalier : touche « lecture/pause »). ✏️ Pas d'appui long au pédalier.
- ✅ Le tempo vient du fichier MuseScore : indications et **changements de tempo**, **reprises, voltas, D.C., D.S., Coda dépliées** dans l'ordre de jeu.
- ✅ **Facteur de tempo** de 50 % à 150 % par pas de 5 %, réglable **pendant** la lecture, mémorisé par partition. ⬜ Saisie directe d'un BPM.
- ✅ **Décompte** (count-in) : 0, 1 ou 2 mesures, visuel (« Count-in… ») et sonore si activé.
- ✅ **Départ depuis** : la page affichée (mode Pages), la première mesure à l'écran (mode Continu), la position de pause si elle est encore à l'écran, ou la mesure choisie avec « Aller à ». ⬜ Mesure touchée (phase 3).
- ✅ **Surlignage de la mesure courante** (option, en couleur).
- **Comportement** :
  - ✅ mode **Continu** : défilement doux qui garde le **système en cours à la ligne de lecture** (réglable, 33 % depuis le haut par défaut) et avance progressivement vers le système suivant ; pas de saccade au changement de système ; si l'utilisateur fait défiler au doigt, le suivi s'interrompt un instant ;
  - ✅ mode **Pages** : la page tourne quand la moitié de la dernière mesure de la page est jouée. ⬜ Avance réglable de N mesures ;
  - ✅ lors d'une reprise, l'affichage **revient en arrière** immédiatement (page précédente, ou saut en mode Continu).
- ✅ **Toucher l'écran pendant la lecture** met en pause (option). ✏️ Un nouveau tap ne relance pas : on relance avec ▶ (évite les départs accidentels).
- ✅ Pause automatique quand l'application passe en arrière-plan.
- ⬜ *(phase 4)* **Boucle** sur une plage de mesures.
- ✅ La partition n'est **jamais jouée** en audio (ADR-010). Seul le métronome produit un son.

#### 3.2.6 Métronome (optionnel)
- ✅ Bouton **métronome** dans la barre de navigation : un tap active ou coupe le clic pendant le défilement (désactivé par défaut, état mémorisé par partition). Touche dédiée au pédalier.
- ✅ **Son** : clic court généré par l'application, **accent sur le premier temps**. Volume réglable. ⬜ Accent désactivable, son coupé (visuel seul) : phase 3.
- ✅ **Visuel** : un point clignote à chaque temps (rouge = premier temps).
- ✅ **Tempo** : il suit le tempo de la partition, ses **changements de tempo et de métrique**, et le facteur de tempo.
- **Deux usages** :
  - ✅ **synchronisé** avec le défilement automatique (démarre après le décompte, s'arrête avec la lecture) ;
  - ✅ **seul** (*metronome only*, **appui long** sur le bouton métronome) : bat au tempo de la partition depuis la première mesure de la page affichée, en suivant la timeline (changements de tempo compris), sans défilement ni surlignage, pendant qu'on tourne les pages à la main ; un tap l'arrête. ⬜ BPM saisi à la main (phase 4).
- ⬜ *(phase 4)* Subdivisions et sons au choix.

#### 3.2.7 Navigation dans une setlist
- ✅ Quand la partition est ouverte depuis une setlist, un bandeau indique « 2/6 · Next: titre » avec les boutons morceau précédent / suivant.
- ✅ Au pédalier, la touche « page suivante » sur la **dernière page** (ou en bas du rouleau en mode Continu) avertit d'abord (« Press again for the next piece ») ; un second appui dans les 3 s passe au morceau suivant. ✅ Touches dédiées « morceau suivant / précédent » (sans confirmation).
- ✅ Les réglages propres à l'entrée de setlist (instruments, transposition, préférence ♯/♭) s'appliquent s'ils existent. Sinon, on reprend ceux de la partition. Les changements d'instruments ou de transposition faits en mode setlist sont enregistrés dans l'entrée.
- ✅ Le morceau suivant est **pré-chargé** en arrière-plan : il s'ouvre presque instantanément.
- ⬜ Liste rapide des morceaux pour sauter directement à l'un d'eux (phase 4).

#### 3.2.8 Autres fonctions de l'écran
- ✅ **Verrouillage** (🔒) : masque les boutons et désactive tous les gestes sauf le tournage de page (zones de tap, balayage, défilement natif en mode Continu) et le pédalier. On déverrouille par **appui long** (0,8 s) sur le cadenas. Le verrouillage vaut pour la session (il reste actif d'un morceau de setlist à l'autre, mais n'est pas enregistré).
- ✅ **Écran toujours allumé** tant que la partition est ouverte (option, activée par défaut).
- ✅ **Thème de la partition** : clair, sépia, sombre, contraste élevé, dans les paramètres. ✏️ Pas de réglage rapide dans la visualisation.
- ✅ **Infos** : titre dans la barre ; les autres informations sont dans la bibliothèque.
- ✅ **Orientation** : suit l'appareil (nouvelle mise en page à la rotation). ⬜ Verrouillage de l'orientation (phase 3).

### 3.3 Onglet Setlists (dans la Bibliothèque)

Une **setlist** est une liste ordonnée de partitions pour une répétition ou un concert.

- ✅ **Liste des setlists** : nom, date (si renseignée), nombre de morceaux, durée totale estimée.
- ✅ **Créer / renommer / dupliquer / supprimer** une setlist. Supprimer une setlist ne supprime pas les partitions.
- **Détail d'une setlist** :
  - ✅ ajouter des partitions (sélecteur multiple depuis la bibliothèque) ;
  - ✅ **réordonner** par glisser-déposer ; retirer un morceau ;
  - ✅ une même partition peut apparaître plusieurs fois (bis, reprise) ;
  - ✅ par entrée : **note libre** et **surcharge optionnelle** des instruments et de la transposition (badge « ♯♭ +2 » ou « Custom ») ;
  - ✅ bouton **« Play »** : ouvre le premier morceau (ou celui qu'on a touché) en mode setlist.
- ✅ Supprimer une partition présente dans des setlists : l'entrée est retirée de chacune et un message liste les setlists concernées.
- ⬜ *(phase 4)* Pauses ou séparateurs (« Entracte »), export/partage d'une setlist.

### 3.4 Écran Paramètres

| Section | Réglage | Valeurs | Défaut | État |
|---|---|---|---|---|
| **Profil** | Mon instrument (présélection) | noms libres + choix rapides (correspondance sans casse ni accents avec le nom de la partie ou l'identifiant MuseScore) | aucun | ✅ |
| | Ma transposition par défaut (première ouverture) | ut / Sib / Mib / Fa | ut | ✅ ✏️ pas de valeur personnalisée |
| **Affichage** | Thème de l'application | système / clair / sombre | système | ✅ |
| | Thème de la partition | clair / sépia / sombre / contraste élevé | clair | ✅ |
| | Noms d'instruments | auto (masqués si une seule partie) / complets / masqués | auto | ✅ ✏️ pas d'« abrégés » |
| | Silences multi-mesures regroupés (vue filtrée) | oui / non | oui | ✅ |
| | Zoom par défaut (première ouverture) | 50–200 % du zoom automatique | 100 % (le zoom automatique dépend du nombre de portées) | ✅ |
| | Police musicale | Leipzig / Bravura / Leland | Leipzig | ⬜ (phase 3) |
| | Notation des notes | anglaise / latine / allemande | selon la langue | ⬜ (phase 3) |
| | Numéros de mesure | aucun / début de système / toutes / toutes les 5 | début de système (rendu Verovio) | ⬜ (phase 3) |
| | Afficher titre et en-têtes | oui / non | — | ✏️ toujours masqués (gain de place) |
| **Navigation** | Mode d'affichage des nouvelles partitions | Pages / Continu | Pages | ✅ |
| | Zones de tap pour tourner les pages | oui / non | oui (tiers de l'écran) | ✅ ⬜ largeur réglable |
| | Balayage pour tourner | oui / non | oui | ✅ |
| | Demi-page | oui / non | non | ✅ |
| | Deux pages en paysage (tablette) | oui / non | oui | ⬜ (phase 3) |
| | Animation de tournage | aucune / glissement / fondu | — | ✏️ aucune |
| **Pédalier / clavier** | Touches de chaque action : page suivante, page précédente, lecture/pause, **métronome**, **morceau suivant**, **morceau précédent** (capture « Press your pedal… », ajouter ou remplacer ; une touche n'appartient qu'à une action) | codes de touches | suivante : →, ↓, PgDn, Espace, Entrée ; précédente : ←, ↑, PgUp, Retour arrière ; lecture : P, touche média ; métronome : M ; morceaux : touches média piste suivante/précédente | ✅ + « restaurer les touches par défaut » |
| **Défilement auto** | Hauteur de la ligne de lecture (mode Continu) | 10–60 % | 33 % | ✅ |
| | Décompte | 0 / 1 / 2 mesures | 1 | ✅ |
| | Clic sonore du décompte (même métronome coupé) | oui / non | oui | ✅ |
| | Surligner la mesure courante | oui / non | oui | ✅ |
| | Toucher = pause | oui / non | oui | ✅ |
| | Avance de tournage (mode Pages) | 0–4 mesures | — | ⬜ (tournage à mi-dernière mesure) |
| **Métronome** | Volume | 0–100 % | 70 % | ✅ |
| | Activé par défaut, son on/off, accent, indicateur visuel | | | ⬜ (phase 3) |
| **Système** | Écran toujours allumé | oui / non | oui | ✅ |
| | Verrouiller l'orientation | non / portrait / paysage | non | ⬜ (phase 3) |
| | Langue | système / English / Français… | système | ⬜ (phase 3, avec la traduction française) |
| | Réinitialiser les paramètres | | | ✅ |
| **Stockage** | Espace utilisé, vider le cache, export/import de la bibliothèque | | | ⬜ (phases 3–4) |
| **À propos** | Version, **licences open source** (GPL, Verovio, webmscore…), lien vers les sources, crédits, mention de marque MuseScore | | | ✅ |

Les paramètres globaux servent de **valeurs par défaut** pour les partitions ouvertes pour la première fois. Les réglages faits dans l'écran Visualisation sont mémorisés **par partition** et l'emportent sur ces défauts.

## 4. Récits utilisateurs prioritaires (MVP)

1. ✅ *En tant que* clarinettiste, *je veux* importer le `.mscz` reçu par e-mail *afin de* le lire à la répétition sans réseau. *(« Ouvrir avec » à essayer sur téléphone.)*
2. ✅ *En tant que* musicien, *je veux* n'afficher que ma partie *afin d'*avoir une partition lisible sur un téléphone.
3. 🟨 *En tant que* musicien, *je veux* tourner la page avec une pédale Bluetooth *afin de* garder les mains sur l'instrument. *(Fait ; vrai pédalier pas encore essayé.)*
4. ✅ *En tant que* saxophoniste alto, *je veux* transposer une partie en ut vers le Mib *afin de* la jouer directement.
5. ✅ *En tant que* musicien, *je veux* que la partition défile toute seule au tempo, avec les reprises, *afin de* ne pas avoir à tourner les pages.
6. ✅ *En tant que* chef, *je veux* afficher plusieurs pupitres à la fois *afin de* suivre une section.
7. ✅ *En tant qu'*utilisateur, *je veux* retrouver mon zoom et mon instrument à la réouverture *afin de* ne pas tout régler à chaque fois.
8. ✅ *En tant que* musicien, *je veux* préparer la setlist du concert et passer d'un morceau à l'autre au pédalier *afin d'*enchaîner sans manipuler mon téléphone.
9. ✅ *En tant que* musicien, *je veux* un métronome optionnel calé sur le tempo de la partition *afin de* travailler seul ou de caler un départ.

## 5. Hors périmètre (pour l'instant)

- Édition des notes (jamais : c'est un lecteur).
- Compte en ligne, synchronisation dans le cloud, téléchargement depuis musescore.com.
- Annotations à main levée : envisagées après la v1 (phase 4), comme un **calque** au-dessus de la partition, sans modifier le fichier.
- Lecture de PDF ou d'images scannées.
- **Lecture audio de la partition** (synthèse, accompagnement) : écartée (ADR-010).
- **Mise en page d'origine** du fichier MuseScore : écartée au profit de la mise en page adaptée à l'écran (ADR-002).
