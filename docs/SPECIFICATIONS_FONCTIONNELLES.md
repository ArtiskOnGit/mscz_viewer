# Spécifications fonctionnelles

> Nom de travail de l'application : **Pupitre** (provisoire, voir [DECISIONS.md](DECISIONS.md)).
>
> **Langue de l'interface : anglais d'abord**, internationalisation prévue dès le départ (ADR-009). Les libellés de ce document sont en français pour la lisibilité ; dans l'application, ils seront en anglais (ex. « Importer » → *Import*).

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
4. **Réglages mémorisés par partition** : on rouvre la partition comme on l'a laissée (instrument, transposition, zoom, page, tempo).
5. **Interface qui s'efface** : la barre d'outils se masque automatiquement et la partition occupe tout l'écran.
6. **Mise en page adaptée à l'écran** : la musique est toujours remise en page pour l'écran de l'appareil. On ne reproduit pas les sauts de page du fichier d'origine (ADR-002).

## 2. Formats pris en charge

| Format | Import | Remarque |
|---|---|---|
| `.mscz` (MuseScore **2.x, 3.x, 4.x**) | ✅ MVP | Format principal. 2.1, 4.5.2 et 4.6.2 validés en phase 0 ; 3.x à confirmer |
| `.mscx` | ✅ MVP | XML MuseScore non compressé |
| `.mxl`, `.musicxml`, `.xml` | ✅ MVP | Conseillé quand un `.mscz` récent pose problème |
| `.mei` | v2 | Pris en charge nativement par Verovio |
| PDF, Guitar Pro | Hors périmètre (à réévaluer) | |

## 3. Écrans

L'application a **trois écrans** principaux. La Bibliothèque a deux onglets, **Partitions** et **Setlists**. Le reste se fait dans des fenêtres secondaires.

```
┌─────────────────────────┐  tap partition / « Jouer » ┌──────────────────┐
│  BIBLIOTHÈQUE           │ ─────────────────────────► │  VISUALISATION   │
│  [Partitions|Setlists]  │ ◄───────────────────────── │  (+ navigation   │
└──────┬──────────────────┘          retour            │   dans setlist)  │
       │ ⚙                                             └────────┬─────────┘
       ▼                                                        ▼ ⚙ réglages rapides
┌───────────────┐                                     ┌──────────────────┐
│  PARAMÈTRES   │                                     │ panneau latéral  │
└───────────────┘                                     └──────────────────┘
```

### 3.1 Écran Bibliothèque (choix de la partition)

**Contenu**
- Liste ou grille (au choix) des partitions importées. Chaque carte montre : **miniature** (page 1), **titre**, compositeur ou arrangeur, nombre d'instruments, durée, date de dernière ouverture.
- **Bouton « Importer »** bien visible (bouton flottant « + ») qui ouvre le sélecteur de fichiers du système. On peut **sélectionner plusieurs fichiers**.
- **Recherche** par titre ou compositeur.
- **Tri** : titre, compositeur, date d'import, dernière ouverture.
- Section « Récemment ouvertes » en tête (MVP : simple tri).

**Actions sur une partition** (appui long ou menu « ⋮ »)
- Ouvrir.
- Renommer (titre affiché uniquement, le fichier n'est pas modifié).
- Informations : métadonnées, version de MuseScore d'origine, instruments, tempo, nombre de mesures, taille.
- Réinitialiser les réglages d'affichage de cette partition.
- Supprimer (avec confirmation).
- **Ajouter à une setlist** (v1).
- *(v2)* Ajouter des étiquettes, partager le fichier d'origine.

**Import**
- Depuis le bouton « Importer » (sélecteur de fichiers : stockage local, Google Drive, iCloud Drive, Fichiers…).
- Depuis **« Ouvrir avec… / Partager vers… »** dans une autre application (e-mail, messagerie, gestionnaire de fichiers). L'application est enregistrée pour les extensions `.mscz`, `.mscx`, `.mxl`, `.musicxml`.
- Une barre de progression s'affiche pour chaque fichier. Si un fichier échoue, un message clair s'affiche avec un conseil, par exemple : « Ce fichier vient d'une version de MuseScore non prise en charge. Exportez-le en MusicXML depuis MuseScore puis importez le `.mxl`. »
- **Doublons** : un fichier identique (même empreinte) n'est pas réimporté. Si le titre est identique mais le contenu différent, on propose « Remplacer » (en gardant les réglages) ou « Garder les deux ».

**État vide** : une illustration, un texte d'aide (« Importez vos fichiers .mscz depuis… ») et le bouton Importer.

### 3.2 Écran Visualisation

Plein écran. La partition occupe tout l'espace. Une **barre d'outils** apparaît au toucher (zone centrale) et se masque après quelques secondes.

#### Barre d'outils (haut)
`← Retour` · Titre · `🎷 Instruments` · `♯♭ Transposer` · `🔍 Zoom` · `▶ Défilement` · `🥁 Métronome` · `⋮ Plus` (+ `⏭ Morceau suivant` en mode setlist)

#### Barre de navigation (bas)
`Page 3 / 12` + curseur de position · `⏮ ◀ ▶ ⏭` · `# Aller à la mesure…`

#### 3.2.1 Choix des instruments
- Fenêtre avec la **liste des instruments** du fichier (nom, nombre de portées, icône si transpositeur).
- **Sélection multiple** par cases à cocher, plus des raccourcis : « Tous (conducteur) », « Aucun sauf… », « Inverser ».
- Préréglages automatiques : si l'utilisateur a défini **« Mon instrument »** dans les paramètres (ex. « Trompette en Sib »), la partie correspondante est **présélectionnée** à la première ouverture.
- L'ordre des portées suit l'ordre de la partition.
- La sélection est mémorisée pour chaque partition.
- *(v2)* Enregistrer des combinaisons nommées (« Cuivres », « Section rythmique »).

#### 3.2.2 Changement de page / défilement manuel
Deux **modes d'affichage**, qu'on change depuis le menu ou les paramètres :

| Mode | Description | Navigation |
|---|---|---|
| **Pages** (par défaut) | Pages à la taille de l'écran, mise en page recalculée pour l'écran | Balayage horizontal, **zones de tap** (tiers gauche = page précédente, tiers droit = page suivante), pédalier, boutons |
| **Continu** | Partition en un seul long rouleau vertical | Défilement au doigt, pédalier (avance d'un écran), défilement automatique |

Options de navigation :
- **Demi-page** (mode Pages) : à la page suivante, on remplace d'abord la moitié haute de l'écran par le haut de la page suivante. Le musicien finit la fin de la page courante pendant qu'il voit déjà le début de la suivante.
- **Deux pages côte à côte** sur tablette en paysage.
- **Pédalier Bluetooth / clavier** : la plupart des pédaliers (AirTurn, PageFlip, Donner…) envoient des touches clavier (flèches, Page suivante/précédente, Espace, Entrée). Les touches sont configurables dans les paramètres.
- **Aller à la mesure n°** ou à une **marque de répétition** (A, B, C… si présentes).
- Animation de changement de page courte (au plus 150 ms) ou désactivable.

#### 3.2.3 Zoom
- **Pincement** à deux doigts, plus des boutons `−` / `+` et des préréglages : « Ajuster à la largeur », 75 %, 100 %, 125 %, 150 %, 200 %.
- En mode Pages, le zoom **recalcule la mise en page** : la musique se répartit sur plus de systèmes ou de pages. On ne fait pas de simple agrandissement d'image, ce qui obligerait à faire défiler horizontalement.
- Zoom mémorisé pour chaque partition (et éventuellement pour chaque orientation, en v2).

#### 3.2.4 Transposition
- Boutons `−½ ton` / `+½ ton`, plus le choix direct d'une **tonalité cible** ou d'un **intervalle** (ex. « Pour instrument en Sib : +2 demi-tons »).
- Affiche la tonalité résultante (« Fa majeur → Sol majeur ») et propose de choisir l'**octave** (±1 octave).
- Bascule **« Hauteur réelle (ut) / Hauteur écrite »** pour les instruments transpositeurs.
- Les **grilles d'accords** sont transposées aussi (à valider avec Verovio).
- Choix des altérations : préférer les ♯ ou les ♭ (mode automatique par défaut).
- Bouton « Réinitialiser ». La transposition est mémorisée pour chaque partition.

#### 3.2.5 Défilement automatique au tempo
- Bouton **▶ / ⏸** (aussi au pédalier : appui long ou touche dédiée).
- Le tempo vient du fichier MuseScore : indications de tempo et **changements de tempo** inclus, **reprises, D.C., D.S., Coda dépliées** dans l'ordre de jeu.
- **Facteur de tempo** de 50 % à 150 % par pas de 5 %, ou saisie directe d'un BPM. Il est réglable **pendant** la lecture.
- **Décompte** (count-in) avant le départ : 0, 1 ou 2 mesures. Il est visuel (clignotement) et sonore (clic) si activé.
- **Départ depuis** : le début, la page courante, ou une **mesure touchée** (tap sur une mesure puis ▶).
- **Surlignage de la mesure courante** (option) : un cadre ou un fond translucide.
- **Comportement** :
  - en mode **Continu** : défilement doux qui garde la ligne en cours à une **hauteur de lecture** réglable (par défaut au tiers supérieur de l'écran), avec anticipation ;
  - en mode **Pages** : tournage automatique quand la mesure courante arrive au dernier système de la page. On peut régler une avance de N mesures, ou le tournage en demi-page.
  - lors d'une reprise, l'affichage **revient en arrière** automatiquement.
- **Toucher l'écran pendant la lecture** met en pause (option). Un tap reprend la lecture.
- *(v2)* **Boucle** sur une plage de mesures (travail d'un passage).
- La partition n'est **jamais jouée** en audio (ADR-010). Seul le métronome peut produire un son.

#### 3.2.6 Métronome (optionnel)
- Bouton **métronome** dans la barre d'outils. Il est désactivé par défaut et son état est mémorisé.
- **Son** : clic court généré par l'application, avec un **accent sur le premier temps** (option). Volume réglable.
- **Visuel** : un indicateur clignote à chaque temps (utile sans son, ou dans le bruit de la répétition).
- **Tempo** : il suit le tempo de la partition, ses **changements de tempo et de métrique**, et le facteur de tempo.
- **Deux usages** :
  - **synchronisé** avec le défilement automatique (démarre après le décompte, s'arrête avec la lecture) ;
  - **seul** : le métronome bat au tempo de la mesure affichée (ou à un BPM saisi), sans défilement, pendant qu'on tourne les pages à la main.
- *(v2)* Subdivisions (croches, triolets) et sons au choix.

#### 3.2.7 Navigation dans une setlist
- Quand la partition est ouverte depuis une setlist, un bandeau discret indique « 2/6 · Titre suivant ».
- **Morceau suivant / précédent** : boutons dans la barre d'outils. Au pédalier, la touche « page suivante » sur la **dernière page** propose le morceau suivant : un second appui confirme, ce qui évite de changer de morceau par erreur.
- Les réglages propres à l'entrée de setlist (instruments, transposition) s'appliquent s'ils existent. Sinon, on reprend ceux de la partition.
- Liste rapide des morceaux de la setlist pour sauter directement à l'un d'eux.

#### 3.2.8 Autres fonctions de l'écran
- **Verrouillage** (icône 🔒) : désactive tous les gestes sauf le tournage de page et le pédalier. On déverrouille par appui long.
- **Écran toujours allumé** tant que la partition est ouverte (option, activée par défaut).
- **Thème de la partition** : clair, sépia, sombre (notes claires sur fond sombre), selon les paramètres et réglable ici rapidement.
- **Infos** : titre, compositeur, tempo, mesure courante.
- **Orientation** : suit l'appareil ou peut être verrouillée.

### 3.3 Onglet Setlists (dans la Bibliothèque)

Une **setlist** est une liste ordonnée de partitions pour une répétition ou un concert.

- **Liste des setlists** : nom, date (optionnelle), nombre de morceaux, durée totale estimée.
- **Créer / renommer / dupliquer / supprimer** une setlist. Supprimer une setlist ne supprime pas les partitions.
- **Détail d'une setlist** :
  - ajouter des partitions (sélecteur multiple depuis la bibliothèque) ;
  - **réordonner** par glisser-déposer ; retirer un morceau ;
  - une même partition peut apparaître plusieurs fois (bis, reprise) ;
  - par entrée : **note libre** (« attaque au signe du chef ») et **surcharge optionnelle** des instruments et de la transposition ;
  - bouton **« Jouer »** : ouvre le premier morceau (ou celui qu'on a touché) en mode setlist.
- Supprimer une partition présente dans des setlists : un avertissement liste les setlists concernées, puis l'entrée est retirée de chacune.
- *(v2)* Pauses ou séparateurs (« Entracte »), export/partage d'une setlist.

### 3.4 Écran Paramètres

| Section | Réglage | Valeurs | Défaut |
|---|---|---|---|
| **Profil** | Mon instrument (présélection) | liste + texte libre (correspondance avec le nom de la partie) | aucun |
| | Ma transposition par défaut | ut / Sib / Mib / Fa / personnalisée | ut |
| **Affichage** | Thème de l'application | système / clair / sombre | système |
| | Thème de la partition | clair / sépia / sombre / contraste élevé | clair |
| | Mode d'affichage par défaut | Pages / Continu | Pages |
| | Zoom par défaut | 50–300 % / automatique | automatique : dépend du nombre de portées affichées (une partie seule s'affiche plus grand qu'un conducteur) |
| | Police musicale | Leipzig / Bravura / (Leland si dispo) | Leipzig |
| | Notation des notes | anglaise (C D E) / latine (Do Ré Mi) / allemande (C D E H) | selon la langue |
| | Numéros de mesure | aucun / début de système / toutes / toutes les 5 | début de système |
| | Noms d'instruments | complets / abrégés / masqués (masqués par défaut si une seule partie est affichée) | auto |
| | Afficher titre et en-têtes | oui / non | oui |
| | Silences multi-mesures regroupés (vue partie) | oui / non | oui |
| **Navigation** | Zones de tap pour tourner les pages | oui / non + largeur des zones | oui, 33 % |
| | Balayage pour tourner | oui / non | oui |
| | Demi-page | oui / non | non |
| | Deux pages en paysage (tablette) | oui / non | oui |
| | Animation de tournage | aucune / glissement / fondu | glissement |
| | Touches du pédalier | page suivante / précédente / lecture-pause (capture de touche « appuyez sur votre pédale ») | flèches, PgUp/PgDn |
| **Défilement auto** | Hauteur de la ligne de lecture | 10–60 % | 33 % |
| | Décompte | 0 / 1 / 2 mesures | 1 |
| | Clic sonore du décompte | oui / non | non |
| | Surligner la mesure courante | oui / non | oui |
| | Toucher = pause | oui / non | oui |
| | Avance de tournage (mode Pages) | 0–4 mesures | 1 |
| **Métronome** | Activé par défaut à l'ouverture | oui / non | non |
| | Son | oui / non (visuel seul) | oui |
| | Volume | 0–100 % | 70 % |
| | Accent sur le premier temps | oui / non | oui |
| | Indicateur visuel | oui / non | oui |
| **Système** | Écran toujours allumé | oui / non | oui |
| | Verrouiller l'orientation | non / portrait / paysage | non |
| | Langue | système / English / Français (puis d'autres) | système, anglais si la langue n'est pas disponible |
| **Stockage** | Espace utilisé, vider le cache de rendu, exporter/importer la bibliothèque (v2) | | |
| **À propos** | Version, **licences open source** (obligatoire GPL), lien vers les sources, crédits (MuseScore/webmscore, Verovio, polices) | | |

Les paramètres globaux servent de **valeurs par défaut**. Les réglages faits dans l'écran Visualisation sont mémorisés **par partition** et l'emportent sur ces défauts.

## 4. Récits utilisateurs prioritaires (MVP)

1. *En tant que* clarinettiste, *je veux* importer le `.mscz` reçu par e-mail *afin de* le lire à la répétition sans réseau.
2. *En tant que* musicien, *je veux* n'afficher que ma partie *afin d'*avoir une partition lisible sur un téléphone.
3. *En tant que* musicien, *je veux* tourner la page avec une pédale Bluetooth *afin de* garder les mains sur l'instrument.
4. *En tant que* saxophoniste alto, *je veux* transposer une partie en ut vers le Mib *afin de* la jouer directement.
5. *En tant que* musicien, *je veux* que la partition défile toute seule au tempo, avec les reprises, *afin de* ne pas avoir à tourner les pages.
6. *En tant que* chef, *je veux* afficher plusieurs pupitres à la fois *afin de* suivre une section.
7. *En tant qu'*utilisateur, *je veux* retrouver mon zoom et mon instrument à la réouverture *afin de* ne pas tout régler à chaque fois.
8. *En tant que* musicien, *je veux* préparer la setlist du concert et passer d'un morceau à l'autre au pédalier *afin d'*enchaîner sans manipuler mon téléphone.
9. *En tant que* musicien, *je veux* un métronome optionnel calé sur le tempo de la partition *afin de* travailler seul ou de caler un départ.

## 5. Hors périmètre (pour l'instant)

- Édition des notes (jamais : c'est un lecteur).
- Compte en ligne, synchronisation dans le cloud, téléchargement depuis musescore.com.
- Annotations à main levée : envisagées après la v1 (phase 4), comme un **calque** au-dessus de la partition, sans modifier le fichier.
- Lecture de PDF ou d'images scannées.
- **Lecture audio de la partition** (synthèse, accompagnement) : écartée (ADR-010).
- **Mise en page d'origine** du fichier MuseScore : écartée au profit de la mise en page adaptée à l'écran (ADR-002).
