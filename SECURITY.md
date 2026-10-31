# Security

`tools/paper.py extract` builds a paper's Lean project and runs Lean over it on your
machine. Lean code can run programs while it compiles, so read a project you do not
trust before extracting it. `check` and `build` read the saved results and run no Lean.

The website is static. It reads the files `build` writes and sends nothing anywhere.

To report a problem privately, use GitHub's private vulnerability reporting on this
repository.
