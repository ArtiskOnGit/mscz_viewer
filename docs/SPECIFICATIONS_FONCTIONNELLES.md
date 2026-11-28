# Spécifications fonctionnelles

> Nom de l'application : **Pupitre** (ADR-006, voir [DECISIONS.md](DECISIONS.md)).
>
> **Langue de l'interface : anglais d'abord**, internationalisation prévue dès le départ (ADR-009) ; **traduction française** depuis la phase 3. Les libellés de ce document sont en français pour la lisibilité ; dans l'application anglaise, ils sont en anglais (ex. « Importer » → *Import*).
>
> **État au 2026-11-25 (fin de la phase 2)** : chaque fonction est marquée ✅ fait, 🟨 partiel, ⬜ pas fait (phase prévue entre parenthèses), ✏️ **écart** avec la spécification d'origine (ce qui a été construit diffère, et pourquoi). Essais sur téléphone : [TESTS_APPAREIL.md](TESTS_APPAREIL.md).

## 1. Vision

Un **lecteur de partitions MuseScore pour musiciens en répétition**. Il ne sert pas à éditer : il sert à **lire vite et bien** sur téléphone ou tablette posée sur un pupitre. On choisit son instrument, on transpose si besoin, on fait défiler à la main, au pédalier ou automatiquement au tempo. Tout fonctionne **sans connexion**. Plateformes : **application Android** (APK) et **application web installable** pour l'**iPhone** et les navigateurs (ADR-027 : même interface ; « Ouvrir avec », « Partager vers » et verrouillage de l'orientation seulement sur Android).

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
7. **Accessibilité** ✅ : cibles tactiles d'au moins 48 px, boutons à icône nommés (anglais et français), éléments de liste lus en entier par les lecteurs d'écran (bibliothèque : titre, compositeur, instruments, durée), bouton « ⋮ plus d'actions » qui reprend les options par balayage (inaccessibles au lecteur d'écran et au clavier), contraste suffisant en thème clair et sombre, animations coupées si le système le demande. Vérifié automatiquement par axe-core (e2e `accessibility.mjs`) ; ⬜ essai avec TalkBack.

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
- ✅ **Bouton flottant « + »** qui s'ouvre sur **deux boutons** (cibles de 48 px, nommés pour les lecteurs d'écran) : **Importer** (icône de document : sélecteur de fichiers du système, avec **sélection multiple**) et **Nouveau dossier** (icône de dossier : demande un nom, crée le dossier dans le dossier affiché).
- ✅ **Dossiers** (ADR-029, 2026-11-28) : pour ranger les partitions, **imbricables**. L'écran montre le **dossier courant** : à la racine, le titre « Library » et les onglets ; dans un dossier, son nom en titre, une **flèche de retour** et le **chemin** (« Library › Concerts › 2026 »). Les **sous-dossiers d'abord** (icône, nom, nombre d'éléments), triés par nom, **puis les partitions**. Chaque dossier est une page (`/library/folder/<id>`) : la flèche de l'en-tête et le **bouton retour d'Android** remontent d'un niveau ; un lien direct vers un dossier (rechargement de la PWA) remonte aussi vers son parent. Dossier supprimé entre-temps : message « Ce dossier n'existe plus ».
- ✅ **Recherche** par titre ou compositeur, dans **toute la bibliothèque** (pas seulement le dossier affiché) : chaque résultat montre son **chemin** (« Dans Library › Concerts »). Les dossiers dont le nom correspond sont listés aussi.
- ✅ **Tri** : dernière ouverture (par défaut), titre, compositeur, date d'import — **à l'intérieur du dossier** ; les dossiers sont toujours triés par nom.

**Actions sur un dossier** (bouton ⋮ « plus d'actions » ou glissement de la ligne, comme pour une partition)
- ✅ Ouvrir (tap).
- ✅ Renommer (un nom vide garde l'ancien).
- ✅ **Déplacer vers…** un autre dossier ou la racine. Le dossier lui-même et ses sous-dossiers sont grisés dans le choix (pas de cycle).
- ✅ Supprimer (avec confirmation) : **aucune partition n'est supprimée**, ses partitions et sous-dossiers remontent dans le dossier parent (ou la racine).

**Actions sur une partition** (glissement de la ligne ou bouton ⋮)
- ✅ Ouvrir (tap).
- ✅ **Déplacer vers…** : fenêtre de choix du dossier (arborescence, entrée « Library (racine) », dossier actuel grisé, **« Nouveau dossier »** qui crée un dossier dans le dossier affiché et y déplace aussitôt).
- ✅ **Sélection multiple** : **appui long** sur une partition (ou « Sélectionner » dans le menu ⋮, pour le lecteur d'écran et le clavier) ; un tap ajoute ou retire une partition ; barre du bas « n sélectionnées · Terminé · Déplacer ». Le bouton retour d'Android quitte d'abord la sélection.
- ✅ Renommer (titre affiché uniquement, le fichier n'est pas modifié ; vide = titre d'origine).
- ✅ Informations : métadonnées, version de MuseScore d'origine, instruments (avec les parties masquées), tempo initial, nombre de mesures, durée, marques de répétition, dates.
- ✅ Réinitialiser les réglages d'affichage de cette partition (depuis les informations).
- ✅ Supprimer (avec confirmation ; retirée aussi des setlists, avec la liste des setlists concernées).
- ✏️ **Ajouter à une setlist** : se fait depuis la setlist (« Add scores »), pas depuis la bibliothèque.
- ⬜ *(phase 4)* Étiquettes, partager le fichier d'origine.

**Import**
- ✅ Depuis le bouton « Import » (sélecteur de fichiers : stockage local, Google Drive…), **dans le dossier affiché**.
- ✅ **Destination des autres imports** (« Ouvrir avec… », « Partager vers… », fichiers rendus par Android après le redémarrage de l'application pendant le sélecteur) : le dossier affiché par la bibliothèque **si une page de la bibliothèque est à l'écran**, sinon la **racine** (par exemple depuis la visualisation ou les paramètres, ou au démarrage à froid). Un doublon reste dans son dossier.
- ✅ **« Ouvrir avec… »** (Android, intent `VIEW`) : la partition est importée puis ouverte. Validé sur téléphone le 2026-11-26.
- ✅ **« Partager vers… »** (Android, intents `SEND` / `SEND_MULTIPLE`, depuis la messagerie, le mail, Drive…) : un fichier partagé est importé puis ouvert ; plusieurs fichiers sont importés, avec le bilan habituel (importés, doublons, erreurs). Mêmes types de fichiers que « Ouvrir avec… » (ADR-024). *(À essayer sur téléphone.)*
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
- ✅ **Clé de chaque instrument** (ADR-028) : à droite de chaque partie à hauteurs déterminées, un menu **Originale (clé de la partition) / Clé de sol / Clé de sol 8 en bas / Clé de fa / Clé d'ut 3e ligne / Clé d'ut 4e ligne** (« Sol », « Fa »… affichés en abrégé, en couleur et en gras quand la clé est changée). Usage typique : trombone, euphonium, tuba lus en clé de sol, ou l'inverse. Seule la clé change : les notes écrites restent les mêmes et sont replacées sur la portée (la clé de sol 8 en bas garde la tessiture : un trombone y est lu à l'octave). Le choix vaut pour **toutes les portées** de la partie (piano : les deux) et pour tout le morceau (les changements de clé en cours de morceau sont retirés) ; les portées de **percussion et de tablature** ne sont jamais modifiées (pas de menu pour une batterie). Appliqué avec « Afficher » ; mémorisé pour chaque partition (ou dans l'entrée de setlist en mode setlist). Le bouton Instruments est aussi proposé pour une partition d'un seul instrument, pour sa clé.
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
- ✅ **Animation de tournage** (paramètre) : aucune, glissement (par défaut) ou fondu, 140 ms, désactivée quand le système demande de réduire les animations ; en mode Continu, « suivant » fait un défilement doux.

#### 3.2.3 Zoom
- ✅ **Pincement** à deux doigts, boutons `−` / `+` (pas de 15 %) et « zoom automatique » (dépend du nombre de portées affichées). ⬜ Préréglages 75 %…200 %.
- ✅ Le zoom **recalcule la mise en page** (pas de simple agrandissement d'image). En mode Pages, on reste sur la même musique ; en mode Continu, la première mesure à l'écran reste en haut.
- ✅ Zoom mémorisé pour chaque partition. ⬜ Par orientation (phase 4).

#### 3.2.4 Transposition
- ✅ Demi-tons (−11…+11) et **octave** (−2…+2), plus des préréglages « instrument en Sib / Mib / Fa ». ✏️ Pas de choix direct d'une tonalité cible : on règle les demi-tons et la tonalité résultante s'affiche.
- ✅ Affiche la tonalité résultante (« C major → D major », « Do majeur → Ré majeur »), selon la notation des notes choisie.
- ✅ Bascule **« Concert pitch »** (hauteur réelle) pour les instruments transpositeurs.
- ✅ **Préférence d'altérations** (*Spelling of the key*) : Auto / ♯ / ♭, proposée quand la tonalité d'arrivée a un équivalent enharmonique (ex. +1 depuis Do : Ré♭ ou Do♯ ; Sol♭/Fa♯ ; Si/Do♭). Auto = le moins d'altérations (♭ en cas d'égalité). La tonalité affichée est exactement celle du rendu (ADR-020).
- ✅ Préréglage brass band **« Si♭ clé de sol »** (*B♭ treble clef*) : transposition +14 demi-tons (neuvième majeure : +2 demi-tons, +1 octave) **et** passage en clé de sol des parties affichées en clé de fa (ou ut 4e, sol 8vb) — la convention des trombones, euphoniums et barytons de brass band. Une note l'explique sous les préréglages ; toucher ensuite un autre réglage annule le changement de clé. Pas proposé dans le détail d'une setlist (la partition n'y est pas analysée).
- 🟨 Les grilles d'accords sont transposées par Verovio (corpus sans grilles d'accords : non vérifié).
- ✅ Bouton « Reset ». La transposition est mémorisée pour chaque partition (ou dans l'entrée de setlist). Une transposition par défaut peut être appliquée à la première ouverture (profil, §3.4).

#### 3.2.5 Défilement automatique au tempo
- ✅ Bouton **▶ / ⏸** (aussi au pédalier : touche « lecture/pause »). ✏️ Pas d'appui long au pédalier.
- ✅ Le tempo vient du fichier MuseScore : indications et **changements de tempo**, **reprises, voltas, D.C., D.S., Coda dépliées** dans l'ordre de jeu.
- ✅ **Facteur de tempo** de 50 % à 150 % par pas de 5 %, réglable **pendant** la lecture, mémorisé par partition. Sur téléphone en portrait, toucher la valeur du tempo ouvre une petite fenêtre (−/+, curseur, retour à 100 %) ; sur un écran plus large, −/+ restent à côté de la valeur. ⬜ Saisie directe d'un BPM.
- ✅ **Décompte** (count-in) : 0, 1 ou 2 mesures, visuel (« Count-in… ») et sonore si activé.
- ✅ **Départ depuis** : la page affichée (mode Pages), la première mesure à l'écran (mode Continu), la position de pause si elle est encore à l'écran, la mesure choisie avec « Aller à », ou une **mesure touchée**.
- ✅ **Mesure touchée** : un **appui long** (0,5 s) sur une mesure, en mode Pages comme en mode Continu, la sélectionne (mesure en bleu, message « ▶ partira de la mesure N ») ; le ▶ suivant part de cette mesure (sa première occurrence à partir de la position courante dans l'ordre de jeu, sinon la dernière avant : 2e passage d'une reprise). Pendant la lecture, l'appui long relance immédiatement depuis la mesure touchée. Un nouvel appui long sur la même mesure annule le choix. Les taps courts gardent leur rôle (zones de tap) ; rien en mode verrouillé. *(À essayer sur téléphone.)*
- ✅ **Surlignage de la mesure courante** (option, en couleur).
- **Comportement** :
  - ✅ mode **Continu** : défilement doux qui garde le **système en cours à la ligne de lecture** (réglable, 33 % depuis le haut par défaut) et avance progressivement vers le système suivant ; pas de saccade au changement de système ; si l'utilisateur fait défiler au doigt, le suivi s'interrompt un instant ;
  - ✅ mode **Pages** : par défaut, la page tourne quand la moitié de la dernière mesure de la page est jouée ; **avance réglable** : la page tourne quand la mesure en cours est à N mesures (0–4) de la fin de la page (0 = au début de la page suivante). Un retour en arrière (reprise) n'est jamais anticipé de plus d'une demi-mesure ;
  - ✅ lors d'une reprise, l'affichage **revient en arrière** immédiatement (page précédente, ou saut en mode Continu).
- ✅ **Toucher l'écran pendant la lecture** met en pause (option). ✏️ Un nouveau tap ne relance pas : on relance avec ▶ (évite les départs accidentels).
- ✅ Pause automatique quand l'application passe en arrière-plan.
- ⬜ *(phase 4)* **Boucle** sur une plage de mesures.
- ✅ **Son de la partition** (ADR-026, depuis le 2026-11-26 ; remplace « jamais jouée », ADR-010) : voir §3.2.6 bis.

#### 3.2.6 Métronome (optionnel)
- ✅ Bouton **métronome** dans la barre de navigation : un tap active ou coupe le clic pendant le défilement (désactivé par défaut, état mémorisé par partition). Touche dédiée au pédalier.
- ✅ **Son** : clic court généré par l'application, **accent sur le premier temps** (désactivable). Volume réglable. Actif ou non pour les nouvelles partitions (paramètre). ⬜ Son coupé (visuel seul).
- ✅ **Visuel** : un point clignote à chaque temps (rouge = premier temps).
- ✅ **Tempo** : il suit le tempo de la partition, ses **changements de tempo et de métrique**, et le facteur de tempo.
- **Deux usages** :
  - ✅ **synchronisé** avec le défilement automatique (démarre après le décompte, s'arrête avec la lecture) ;
  - ✅ **seul** (*metronome only*, **appui long** sur le bouton métronome) : bat au tempo de la partition depuis la première mesure de la page affichée, en suivant la timeline (changements de tempo compris), sans défilement ni surlignage, pendant qu'on tourne les pages à la main ; un tap l'arrête. ⬜ BPM saisi à la main (phase 4).
- ⬜ *(phase 4)* Subdivisions et sons au choix.

#### 3.2.6 bis Son de la partition et mixeur (ADR-026)
- ✅ **Son** : pendant le défilement automatique, la partition est **jouée** (instruments General MIDI synthétisés à partir de la partition), calée sur le défilement : tempo et facteur de tempo, reprises, décompte (le son commence après), départ depuis une page, une mesure choisie ou touchée, pause qui coupe aussitôt. Le **métronome** peut jouer en même temps. Son coupé = défilement muet comme avant.
- ✅ **Bouton haut-parleur** dans la barre du bas (si la partition a du son) : un **toucher** ouvre la feuille « Son » (la partition reste visible au-dessus) ; un **appui long** active ou coupe le son. Rien n'est chargé tant que le son n'a pas été activé (≈ 1 s la première fois, PC).
- ✅ **Feuille « Son »** : interrupteur « Jouer la partition », **volume général**, **mixage rapide** « Tous », « Moi seul », « Sans moi » (d'après le profil « My instrument » ; message si le profil est vide ou ne correspond à aucune partie), puis **une ligne par partie** : nom, **muet**, **solo**, curseur de volume (0–100 %). Les réglages s'appliquent tout de suite, même pendant la lecture.
- ✅ Son activé/coupé et mixage **mémorisés par partition** ; en setlist, le mixage est gardé **pour le morceau** (surcharge). Paramètres : son activé pour les nouvelles partitions, volume par défaut.
- ✅ Le son est à la **hauteur réelle** (la transposition d'affichage ne le change pas).
- ⬜ *(phase 4)* Banque de sons plus riche en option, réverbération réglable.

#### 3.2.7 Navigation dans une setlist
- ✅ Quand la partition est ouverte depuis une setlist, un bandeau indique « 2/6 · Next: titre » avec les boutons morceau précédent / suivant.
- ✅ Au pédalier, la touche « page suivante » sur la **dernière page** (ou en bas du rouleau en mode Continu) avertit d'abord (« Press again for the next piece ») ; un second appui dans les 3 s passe au morceau suivant. ✅ Touches dédiées « morceau suivant / précédent » (sans confirmation).
- ✅ Les réglages propres à l'entrée de setlist (instruments, clés, transposition, préférence ♯/♭) s'appliquent s'ils existent. Sinon, on reprend ceux de la partition. Les changements d'instruments, de clé ou de transposition faits en mode setlist sont enregistrés dans l'entrée.
- ✅ Le morceau suivant est **pré-chargé** en arrière-plan : il s'ouvre presque instantanément.
- ⬜ Liste rapide des morceaux pour sauter directement à l'un d'eux (phase 4).

#### 3.2.8 Autres fonctions de l'écran
- ✅ **Verrouillage** (🔒) : masque les boutons et désactive tous les gestes sauf le tournage de page (zones de tap, balayage, défilement natif en mode Continu) et le pédalier. On déverrouille par **appui long** (0,8 s) sur le cadenas. Le verrouillage vaut pour la session (il reste actif d'un morceau de setlist à l'autre, mais n'est pas enregistré).
- ✅ **Écran toujours allumé** tant que la partition est ouverte (option, activée par défaut).
- ✅ **Thème de la partition** : clair, sépia, sombre, contraste élevé, dans les paramètres. ✏️ Pas de réglage rapide dans la visualisation.
- ✅ **Infos** : titre dans la barre ; les autres informations sont dans la bibliothèque.
- ✅ **Orientation** : suit l'appareil (nouvelle mise en page à la rotation) ou verrouillée en portrait / paysage (paramètre, Android).

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
| | Police musicale | Leipzig / Bravura / Leland (incluses dans Verovio) | Leipzig | ✅ |
| | Notation des notes | anglaise / latine / allemande | selon la langue | ✅ |
| | Numéros de mesure | aucun / début de ligne / toutes / toutes les 5 | début de ligne | ✅ |
| | Afficher le titre (titre et compositeur au-dessus de la première page) | oui / non | oui | ✅ |
| **Navigation** | Mode d'affichage des nouvelles partitions | Pages / Continu | Pages | ✅ |
| | Zones de tap pour tourner les pages | oui / non ; largeur 20–45 % de l'écran | oui, 33 % | ✅ |
| | Balayage pour tourner | oui / non | oui | ✅ |
| | Demi-page | oui / non | non | ✅ |
| | Deux pages en paysage (tablette) | oui / non | oui | ⬜ (phase 3) |
| | Animation de tournage | aucune / glissement / fondu (140 ms, aucune si « réduire les animations ») | glissement | ✅ |
| **Pédalier / clavier** | Touches de chaque action : page suivante, page précédente, lecture/pause, **métronome**, **morceau suivant**, **morceau précédent** (capture « Press your pedal… », ajouter ou remplacer ; une touche n'appartient qu'à une action) | codes de touches | suivante : →, ↓, PgDn, Espace, Entrée ; précédente : ←, ↑, PgUp, Retour arrière ; lecture : P, touche média ; métronome : M ; morceaux : touches média piste suivante/précédente | ✅ + « restaurer les touches par défaut » |
| **Défilement auto** | Hauteur de la ligne de lecture (mode Continu) | 10–60 % | 33 % | ✅ |
| | Décompte | 0 / 1 / 2 mesures | 1 | ✅ |
| | Clic sonore du décompte (même métronome coupé) | oui / non | oui | ✅ |
| | Surligner la mesure courante | oui / non | oui | ✅ |
| | Toucher = pause | oui / non | oui | ✅ |
| | Avance de tournage (mode Pages) | mi-dernière mesure / 0–4 mesures avant la fin | mi-dernière mesure | ✅ |
| **Métronome** | Volume | 0–100 % | 70 % | ✅ |
| | Activé pour les nouvelles partitions | oui / non | non | ✅ |
| | Accent sur le premier temps | oui / non | oui | ✅ |
| | Son coupé (visuel seul) | | | ⬜ |
| **Système** | Écran toujours allumé | oui / non | oui | ✅ (application web : API Wake Lock, masqué si absente) |
| | Orientation de l'écran | suivre l'appareil / portrait / paysage | suivre l'appareil | ✅ (Android ; masqué dans l'application web) |
| | Langue | système / English / Français… | système | ✅ |
| | Réinitialiser les paramètres | | | ✅ |
| **Stockage** | Espace utilisé (partitions, cache de rendu), vider le cache de rendu | | | ✅ |
| | *Application web* : **Utilisation hors ligne** (téléchargement de tout ce qu'il faut sans réseau : progression, « Prêt », bouton « Télécharger pour l'utilisation hors ligne » si interrompu) et **Stockage protégé** (stockage persistant accordé ou non, bouton pour le demander) | | | ✅ (ADR-027) |
| | Export/import de la bibliothèque | | | ⬜ (phase 4) |
| **À propos** | Version, **licences open source** (GPL, Verovio, webmscore…), lien vers les sources, crédits, mention de marque MuseScore | | | ✅ |

Les paramètres globaux servent de **valeurs par défaut** pour les partitions ouvertes pour la première fois. Les réglages faits dans l'écran Visualisation sont mémorisés **par partition** et l'emportent sur ces défauts.

## 4. Récits utilisateurs prioritaires (MVP)

1. ✅ *En tant que* clarinettiste, *je veux* importer le `.mscz` reçu par e-mail *afin de* le lire à la répétition sans réseau. *(« Ouvrir avec » validé sur téléphone ; « Partager vers » à essayer.)*
2. ✅ *En tant que* musicien, *je veux* n'afficher que ma partie *afin d'*avoir une partition lisible sur un téléphone.
3. 🟨 *En tant que* musicien, *je veux* tourner la page avec une pédale Bluetooth *afin de* garder les mains sur l'instrument. *(Fait ; vrai pédalier pas encore essayé.)*
4. ✅ *En tant que* saxophoniste alto, *je veux* transposer une partie en ut vers le Mib *afin de* la jouer directement.
5. ✅ *En tant que* musicien, *je veux* que la partition défile toute seule au tempo, avec les reprises, *afin de* ne pas avoir à tourner les pages.
6. ✅ *En tant que* chef, *je veux* afficher plusieurs pupitres à la fois *afin de* suivre une section.
7. ✅ *En tant qu'*utilisateur, *je veux* retrouver mon zoom et mon instrument à la réouverture *afin de* ne pas tout régler à chaque fois.
8. ✅ *En tant que* musicien, *je veux* préparer la setlist du concert et passer d'un morceau à l'autre au pédalier *afin d'*enchaîner sans manipuler mon téléphone.
9. ✅ *En tant que* musicien, *je veux* un métronome optionnel calé sur le tempo de la partition *afin de* travailler seul ou de caler un départ.
10. 🟨 *En tant que* musicien équipé d'un iPhone, *je veux* installer Pupitre depuis Safari et l'utiliser hors ligne en répétition (import, partition, son) *afin de* ne pas dépendre d'un téléphone Android. *(Application web, ADR-027 ; testée dans WebKit émulé, à essayer sur un vrai iPhone.)*

Dans l'application web, une nouvelle version publiée est téléchargée en arrière-plan puis proposée par un message **« Nouvelle version disponible — Recharger »**.

## 5. Hors périmètre (pour l'instant)

- Édition des notes (jamais : c'est un lecteur).
- Compte en ligne, synchronisation dans le cloud, téléchargement depuis musescore.com.
- Annotations à main levée : envisagées après la v1 (phase 4), comme un **calque** au-dessus de la partition, sans modifier le fichier.
- Lecture de PDF ou d'images scannées.
- **Mise en page d'origine** du fichier MuseScore : écartée au profit de la mise en page adaptée à l'écran (ADR-002).
