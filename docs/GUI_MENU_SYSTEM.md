# Menus Babylon GUI (main + choix de niveau)

Ce document décrit **comment l’UI menu est branchée** dans TankController : fichiers, scène, deux `AdvancedDynamicTexture` séparés, et comment le faire évoluer sans retomber dans les pièges déjà rencontrés.

## Architecture

### Deux textures plein écran, une seule scène menu

L’UI est rendue avec **@babylonjs/gui** sur la **scène menu** (`menuScene` dans `GameApp`), pas sur la scène de gameplay.

**Règle importante** : le menu principal et l’écran de choix de niveau utilisent **deux** `AdvancedDynamicTexture` distincts :

| Texture        | Fichier JSON              | Rôle |
|----------------|---------------------------|------|
| `menuUi`       | `assets/ui/UI_mainmenu.json` | Menu titre (Play, Options, etc.) |
| `levelSelectUi` | `assets/ui/UI_levels.json`  | Choix map / mission / Start / Retour |

**Ne pas** charger `UI_levels.json` dans la même texture que `UI_mainmenu.json`. Fusionner deux exports d’éditeur dans un seul ADT provoque en pratique des conflits de noms (`getControlByName`), des problèmes d’ordre de dessin / picking, et des références de contrôles invalides. **Deux ADT = deux arbres indépendants**, le basculement d’écran reste simple et fiable.

### Basculement menu ↔ niveaux

Le code ne montre ni ne cache contrôle par contrôle : il agit sur **`rootContainer`** et sur la priorité d’affichage :

- `rootContainer.isVisible` — l’écran entier est visible ou non.
- `isForeground` — indique à Babylon quelle texture fullscreen est **au premier plan** pour le rendu / le picking.

Fonctions concernées dans `src/app/GameApp.ts` :

- `showMainMenu()` — affiche `menuUi`, masque `levelSelectUi` (si déjà créé).
- `showPlaySelect()` — masque `menuUi`, affiche `levelSelectUi`.

### Chargement paresseux de l’écran niveaux

- Au démarrage, seul **`ensureMenuUi()`** s’exécute : parse de `UI_mainmenu.json`, puis `showMainMenu()`.
- **`ensureLevelSelectUi()`** n’est appelée qu’au premier « Play » (`openLevelSelectScreen()`). Elle crée `levelSelectUi`, parse `UI_levels.json`, câble les boutons, puis met `rootContainer.isVisible = false` jusqu’à `showPlaySelect()` (évite un flash d’un frame).

## Fichiers et conventions de noms

### Assets JSON (GUI Editor)

- `assets/ui/UI_mainmenu.json` — contrôles du menu titre.
- `assets/ui/UI_levels.json` — contrôles de l’écran de sélection.

**Préfixe recommandé** pour les noms exposés au code :

- `mm_*` — menu principal (`mm_root`, `mm_btn_play`, …).
- `ps_*` — écran play / niveaux (`ps_root`, `ps_stack_maps`, `ps_btn_back`, …).

Ces noms sont utilisés dans `getControlByName` après parse. Gardez des noms **uniques par texture** (pas de collision entre deux `TextBlock` nommés `load` dans la **même** JSON si possible ; entre les deux fichiers ce n’est plus un problème puisque les ADT sont séparés).

### Images de fond

Les JSON peuvent référencer la texture checker Babylon par défaut. `menuUrlRewriter` dans `GameApp` redirige cette URL vers `assets/ui/menu_background.png` pour un fond cohérent en build (Vite).

### Données des listes (maps / missions)

Le contenu des listes (libellés, `LevelDefinition`, missions) est défini dans **`src/ui/menuData.ts`** (`MENU_MAPS`, etc.), pas dans le JSON. Les stacks `ps_stack_maps` et `ps_stack_missions` sont remplis en code (`populateMaps` / `populateMissions`) avec des `Button` créés dynamiquement.

## Point d’entrée code

| Élément | Fichier |
|---------|---------|
| Création des ADT, parse, navigation | `src/app/GameApp.ts` |
| Données menu (maps, missions, terrain) | `src/ui/menuData.ts` |
| Définitions de niveau (gameplay) | `src/app/levels` (types référencés par `menuData`) |

Flux typique :

1. Clic **Play** → `openLevelSelectScreen()` → `ensureLevelSelectUi()` (une fois) → `showPlaySelect()`.
2. Clic **Retour** (`ps_btn_back`) → `showMainMenu()`.
3. Clic **Start** (après map + mission) → `startLevel()` (scène gameplay).

## Mise en place d’un nouvel écran GUI

1. **Créer un nouveau JSON** (ou dupliquer un existant) dans `assets/ui/`.
2. **Créer un nouvel `AdvancedDynamicTexture`** sur `menuScene` (ne pas réutiliser `menuUi` / `levelSelectUi` pour un gros écran indépendant).
3. **`ParseFromFileAsync`** sur cette texture, avec le même `menuUrlRewriter` si des images doivent être remappées.
4. **Nommer** les contrôles à manipuler, puis `getControlByName` + `onPointerClickObservable` (ou `onControlPicked` pour le debug).
5. Basculer la visibilité **via `rootContainer.isVisible` + `isForeground`**, comme pour les deux écrans actuels.

## Debug

Dans `GameApp`, le flag `DEBUG_MENU_NAV` (lorsqu’il est à `true`) trace dans la console les messages « menu » / « niveau » et peut brancher `onControlPickedObservable` sur chaque ADT pour voir **quel** contrôle reçoit vraiment le clic.

## Résumé

- **Deux ADT** : menu et niveaux sur la même `menuScene`, jamais deux JSON dans le même arbre.
- **Un seul endroit** par écran : `rootContainer` visible ou non, `isForeground` pour le calque actif.
- **Données de liste** dans `menuData.ts` ; **mise en page** dans les JSON ; **câblage** dans `GameApp.ts`.
