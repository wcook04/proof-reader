# Contributing

## Add a paper

Follow [the add-paper skill](skills/add-paper/SKILL.md). A new paper changes only its
own folder under `papers/`. The paper and the Lean project need licences that allow them
to be hosted, or their authors' permission, and each folder names both.

## Report a wrong link or note

Open an issue naming the paper, the passage and the Lean declaration. If you are an
author of a paper here and want it changed or removed, say so and it will be.

## Change the code

Data flows one way: `papers/<slug>/` to `tools/paper.py` to `web/public/papers/` to
`web/`. Keep the code free of knowledge of any one paper.

```sh
python3 -m unittest discover -s tests
python3 tools/paper.py check contextual-embeddings
python3 tools/paper.py build
cd web && npm ci && npm run build
```

Look at any visual change in a browser at laptop and monitor widths.
