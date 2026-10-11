# Build report — Squad Rush (3D, three.js)

Размеры по сетям одинаковы для всех вариантов. Сгенерировано `python tools/build_playable.py --variant all`.


| network | file | size | limit | ok |
|---|---|---|---|---|
| applovin | `applovin.html` | 1.02 MB | 5 MB | yes |
| unity | `unity.html` | 1.02 MB | 5 MB | yes |
| ironsource | `ironsource.html` | 1.02 MB | 5 MB | yes |
| mintegral | `mintegral.html` | 1.02 MB | 5 MB | yes |
| google | `google.zip` | 0.33 MB | 5 MB | yes |
| meta | `meta.html` | 1.02 MB | 2 MB | yes |
| preview | `preview.html` | 1.02 MB | 5 MB | yes |

## What the bytes are (before base64 for images/models, +33% inline)

| part | size |
|---|---|
| three.js (tree-shaken) | 696 KB |
| game code (minified) | 56 KB |
| image hand | 7 KB |
| model soldier | 118 KB |
| model giant | 67 KB |
