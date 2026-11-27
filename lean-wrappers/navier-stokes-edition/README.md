# Lean statements for the adapted Navier–Stokes edition

**The 47 numbered results of Alpöge and Buckmaster's paper, each mapped to one Lean declaration: 28 proved, in the stated formal form, and 19 stated as open propositions.** The modules are added to the authors' package at commit `ad53419` without editing any of their Lean files. `statements.json` is the machine-readable index; the table below gives every row with its difference from the printed statement.

## Verification status

Workflow `.github/workflows/navier-stokes-edition.yml`, on public Actions:

- Every module compiles against the authors' package at `ad53419` with Lean 4.33.1. The installer checked all 2,282 pinned files of the authors' package; the only change to it is an appended, delimited Lake section.
- Axioms: the 28 proved numbered results and five supporting statements (33 declarations, in the published Actions run) depend only on `propext`, `Classical.choice` and `Quot.sound`.
- Comparator (exports written by lean4export under Lean 4.33.1, judged under Lean 4.36.0) accepts `NavierStokes.theorem_1_1_space` and `NavierStokes.conditional_main` against the fixed statements in `comparison/EditionChallenge.lean.in`. Lean's paranoid kernel, con-leche, con-ron (77,722 declarations), nanoda and Lean's default kernel all accept the solution.
- The control `comparison/WeakenedMain.lean`, which gives the same names weaker conclusions (local solutions only; the whole-space half of the main conclusion only), is rejected for a statement mismatch, both together and for each name separately.

A row marked "reduced" proves its displayed formal statement, including any narrowing or reformulation recorded in the last column; it does not claim the printed statement unchanged. "Open" means a proposition in `lean/OpenTargets.lean` with no proof attached; it does not mean the assertion is false.

The first build found compile errors in `SectionAnalysisDefinitions.lean` (λ used as a variable name, two docstrings placed before `open … in`, two sums whose scope ended early, an `ENNReal` fact), `AppendixB.lean` (a nonnegativity proof) and `SectionSeven.lean` (an almost-everywhere equality and a heartbeat limit). They were fixed here; no statement changed.

## Read the two main statements

| Statement | Assumption | Conclusion |
|---|---|---|
| `NavierStokes.theorem_1_1_space` | A specified nonzero smooth recurrent profile, with positive period, orthogonal isometry, velocity decay through order two and the separately displayed pressure-gradient bound | One smooth, uniformly finite-energy solution on `[0,1)`, with the two-sided gradient rate, physical error (1.6), initial approximation, uniqueness and no finite-energy smooth continuation through 1 |
| `NavierStokes.conditional_main` | Either such a profile with pressure decay, **or** data satisfying every formal extended-certificate condition | The authors’ whole-space and torus nonexistence conclusions, for every positive viscosity |

The second conclusion does not itself state a quantitative torus trajectory. The whole-space excluded class has uniformly bounded energy. The torus excluded class has periodic velocity and allows every smooth pressure. The datum may depend on viscosity. The certificate assumption is a mathematical condition on data; no numerical certificate is included.

## Pressure decay for Theorem 1.1

For a specified profile satisfying `Theorem11.IsPaperProfile`, a uniform bound
`‖D²W(s,y)‖ ≤ B / (1 + ‖y‖)³` implies `‖Dq(s,y)‖ ≤ D / (1 + ‖y‖)³`
for some constant D. The Hessian estimate remains an additional assumption.
Deriving the Hessian estimate from the printed velocity and first-derivative
bounds remains open.

The proof integrates the momentum equation over a finite interval in similarity
time. The gradient of the integrated pressure decays at least as inverse distance.
The integral of its squared norm over a radius-r ball therefore grows at most
linearly in r. This bound suffices for the harmonic interior estimate as r
tends to infinity and removes the need to assume finite global pressure-gradient
energy. Harmonic uniqueness then identifies this gradient with the negative
time integral of the Newton gradient of the quadratic velocity source.
The existing near- and far-field estimates give cubic decay for the Newton
gradient. Differentiating the interval bound gives the pointwise conclusion.
The public statement is `ProfileDecay.paperPressureContract` in
[`ContractCheck.lean`](lean/ContractCheck.lean). The component proofs are in
[`support/theorem11/pressure/`](support/theorem11/pressure/). After running
the installer, use `lake build ContractCheck` to check these results.

`ProfileDecay.velocityDecay_supplies_pressure` packages the velocity and pressure
bounds with one enlarged coefficient, as `theorem_1_1_space` requires. Both
pressure declarations are included in `lean/EditionAxioms.lean`.

## Install and build

Use a clean copy of the authors’ package at `ad53419de079eb8f95f60313473374624a348546`, with Lean `v4.33.1` and Mathlib `0df444a360eaa60ab8c11dca51a86af692955474`.

```bash
python3 scripts/install.py /absolute/path/to/navier-stokes/lean --check-only
python3 scripts/install.py /absolute/path/to/navier-stokes/lean
cd /absolute/path/to/navier-stokes/lean
lake exe cache get
lake build EditionStatements OpenTargets EditionChallenge WeakenedMain EditionAxioms
```

The installer checks 2,282 original package files against the pins, adds new modules and appends a clearly delimited Lake configuration section. It refuses source mismatches, collisions and differing pre-existing additions. It changes no original `.lean` file and preserves the original Comparator configurations.

The new comparison configurations are installed under `edition-comparison/`. `EditionChallenge.lean` is generated from a fixed, checked-in statement template. It is the sole generated module with proof placeholders, as required by Comparator’s challenge format. No solution imports it. The delivered proof `.lean` files contain no unfinished proofs or new axioms.

For the existing cross-version Comparator setup, export with the Lean 4.33.1-compatible `lean4export` and judge with the trusted checker setup already used by proof-reader. Alternatively, if using the matching standalone Comparator executable:

```bash
python3 /absolute/path/to/navier-stokes-edition/scripts/run_comparator.py   /absolute/path/to/navier-stokes/lean   --comparator /absolute/path/to/comparator
```

Both main declarations are compared. Four named external kernels are configured in addition to Lean’s default kernel. The negative controls keep the **same challenge** and supply weaker conclusions with proofs. Each control must fail for a statement mismatch; compilation failure or a missing executable is a failed test, not an accepted negative control.

To check axiom reports:

```bash
lake env lean EditionAxioms.lean > edition-comparison/axioms.log
python3 /absolute/path/to/navier-stokes-edition/scripts/check_axioms.py edition-comparison/axioms.log
```

The axiom checker requires an actual report for every expected declaration; an empty or partial log fails.

## Numbered map

Every row has one primary declaration. Supporting ingredients and supplementary open bridges are described in the notes and in `statements.json`.

| Numbered result | Primary Lean declaration | Status | Authors’ declarations used | Difference from the printed statement |
|---|---|---|---|---|
| Theorem 1.1 | `NavierStokes.theorem_1_1_space` | reduced | `Breakdown.transferHolds_of_dichotomy`<br>`Breakdown.dichotomyHolds`<br>`Breakdown.profileOrbit_holds`<br>`Breakdown.mildRegular_realization`<br>`Breakdown.eq_of_isSolutionOn` | Whole-space conclusion (1.6) is retained in physical variables, with arbitrary initial approximation, uniqueness and no finite-energy smooth continuation. The formal hypotheses explicitly add second-derivative and pressure-gradient decay. A supporting theorem derives pressure decay from the velocity hypotheses through order two. The velocity Hessian estimate from the printed assumptions and the quantitative torus part (1.7) remain open. |
| Proposition 2.1 | `NavierStokes.proposition_2_1_target` | open | `Breakdown.transferHolds_of_dichotomy`<br>`Breakdown.dichotomyHolds` | The target preserves the printed statement. The available transfer theorem chooses a close datum instead of correcting every nearby prescribed datum in one fixed finite-dimensional space. |
| Proposition 2.2 | `NavierStokes.proposition_2_2_target` | open | `Breakdown.Periodic.TorusBlowup`<br>`Breakdown.Periodic.torusBlowup_of_parts` | The target uses a mean-zero unit-torus Fourier realization and retains T≤1, both rates and the local physical error. The existing TorusBlowup assertion only retains unboundedness. |
| Lemma 2.3 | `NavierStokes.lemma_2_3_target` | open | `Breakdown.mildRegular_realization`<br>`Breakdown.MildRegular` | The target includes both domains, one representative on the whole half-open interval, and energy nonincrease. The authors’ linked result is on each closed whole-space interval. |
| Lemma 3.1 | `NavierStokes.lemma_3_1_target` | open | `Breakdown.Freq.bilin_holds`<br>`Breakdown.Freq.bilinShift_holds`<br>`Breakdown.Freq.bilinCont_holds`<br>`Breakdown.Freq.phiX` | The target includes the arbitrary L^(3/2) projected-heat operator. The proved ingredient establishes the bilinear forcing subclass only. |
| Lemma 3.2 | `NavierStokes.lemma_3_2` | reduced | `Breakdown.Freq.bilinCompact_holds`<br>`Breakdown.Freq.testDense_holds`<br>`Breakdown.Freq.bilinX` | none |
| Lemma 3.3 | `NavierStokes.lemma_3_3` | reduced | `Breakdown.varConstIntegral` | none; the Banach-space result uses the stated abstract heat-bilinear hypotheses, and the auxiliary suprema are obtained within the proof. |
| Lemma 3.4 | `NavierStokes.lemma_3_4_target` | open | `Breakdown.pieceOperator`<br>`Breakdown.Periodic.InverseAlgebra.Internal.sub_apply_inverse_one_sub` | The target asserts a bounded linear inverse on every finite interval, without a small operator-norm assumption. |
| Lemma 3.5 | `NavierStokes.lemma_3_5` | reduced | `Breakdown.varConstIntegral`<br>`Breakdown.mildUnique` | none; the restriction identity is supplied for independent f and h, and the uniqueness clause concerns quadratic mild solutions. |
| Lemma 3.6 | `NavierStokes.lemma_3_6_target` | open | `Breakdown.Freq.mild_holds`<br>`Breakdown.Freq.IsWeakSolution` | The target retains the paper’s continuous homogeneous H¹ weak-solution class; the available theorem imposes additional decay and L²-difference conditions. |
| Lemma 3.7 | `NavierStokes.lemma_3_7_target` | open | `Breakdown.Periodic.kernelSharpBound_holds`<br>`Breakdown.Periodic.coeff`<br>`Breakdown.Periodic.kernel` | The target keeps every period L>0 and lag τ>0, mean zero and the homogeneous norm; the available estimate is for the unit torus, inhomogeneous H¹ and 0<τ≤1. |
| Proposition 4.1 | `NavierStokes.proposition_4_1_target` | open | `Breakdown.orbitPhysical`<br>`Breakdown.embeddedProfileOrbit_holds` | The target retains the printed profile, its nonzero velocity and its prescribed recurrence. The existing orbit construction uses the enhanced library profile class. |
| Lemma 4.2 | `NavierStokes.lemma_4_2_target` | open | `Breakdown.orbitNorm`<br>`Breakdown.orbitBound` | The target retains both the iterated physical recurrence and the two-sided physical norm rate; the proved ingredient bounds the similarity orbit above and below. |
| Proposition 4.3 | `NavierStokes.proposition_4_3_target` | open | `Breakdown.stepData`<br>`Breakdown.dichotomyHolds`<br>`Breakdown.periodicInverse` | The target is a bounded inverse on Cκ([0,1);X). The available theorem is a bounded inverse on sequences of short solution pieces. |
| Lemma 4.4 | `NavierStokes.lemma_4_4_target` | open | `Breakdown.monodromy` | The target uses the paper’s single-period Volterra monodromy. The authors’ proof uses a product of sufficiently short steps. |
| Lemma 4.5 | `NavierStokes.lemma_4_5` | reduced | `Breakdown.dichotomyHolds` | States the authors’ quantitative geometric spectral bounds for T₀+C. The printed formulation chooses an intermediate Θ and writes the two resulting convergent series for the paper’s monodromy. |
| Lemma 4.6 | `NavierStokes.lemma_4_6_target` | open | `Breakdown.discreteDichotomy`<br>`Breakdown.periodicInverse` | The target is formulated for an abstract recurrent MildFramework orbit and keeps the continuous-to-discrete formulas, forcing linearity and the uniform weighted estimate. |
| Lemma 4.7 | `NavierStokes.lemma_4_7_target` | open | `Breakdown.varConstIntegral` | The target keeps all three weighted estimates and chooses the constant from κ and CK before quantifying the space and operators. |
| Lemma 4.8 | `NavierStokes.lemma_4_8_target` | open | `Breakdown.contraction` | The target keeps the arbitrary weighted residual and chooses ε₁ from κ and CK. The available contraction is stated for a sequence of short pieces. |
| Lemma 5.1 | `NavierStokes.lemma_5_1_target` | open | `Breakdown.Periodic.approxFieldProperties_holds`<br>`Breakdown.Periodic.cutoffGradientClose`<br>`Breakdown.Periodic.cutoffMassBound` | The target keeps all r>0 and constants independent of r,t. The existing cutoff is centred at (1/2,1/2,1/2) with fixed inner/outer radii. |
| Lemma 6.1 | `NavierStokes.lemma_6_1_target` | open | `Breakdown.Periodic.heatDivFreeComparison`<br>`Breakdown.Periodic.HeatDivFreeComparison` | The target retains every L≥1,t>0, compactly supported W^(1,1) tensor forcing, and the explicit CL^(-7/2) rate. The available comparison is local, has lag bounded away from zero, and supplies no explicit rate. |
| Lemma 6.2 | `NavierStokes.lemma_6_2_target` | open | `Breakdown.Periodic.approxSizes`<br>`Breakdown.Periodic.approxResidualSmall`<br>`Breakdown.Periodic.transplantNorm` | The target keeps the physical large-period formulation, equality of homogeneous norms and the L^(-1/2) residual. The proved ingredients give normalized interval bounds. |
| Lemma 6.3 | `NavierStokes.lemma_6_3_target` | open | `Breakdown.Periodic.shellInverseTransfer`<br>`Breakdown.Periodic.rightInversePerturb`<br>`Breakdown.Periodic.ComparisonSmall` | The target specifies the approximate inverse (6.12) and CL^(-1/2) defect. The available theorem transfers an exact inverse under sufficiently small localized operator differences. |
| Theorem 7.1 | `NavierStokes.theorem_7_1` | reduced | `Breakdown.Cert.extendedExistsZeroHeldHolds_of`<br>`Breakdown.Cert.Internal.ExtendedSigmaProfileOfHeld.profile_joint`<br>`Breakdown.FarField.smoothFieldOfOrbit_holds`<br>`Breakdown.FarField.farFieldDecay_holds` | The input is IsExtendedCertificate, with the formal approximate-profile regularity and decay requirements. The output also states Hessian and pressure-gradient decay. All parameter, correction, pin, bound and symmetry clauses of (7.38)–(7.39) are retained. |
| Corollary 7.2 | `NavierStokes.corollary_7_2` | reduced | `Breakdown.breakdownOnSpace_of_profile`<br>`Breakdown.Periodic.breakdownOnTorus_of_profile` | Keeps the selected certificate profile and, for every epsilon>0, constructs the quantitative global space solution with the physical-variable error in (1.6), uniqueness and no continuation. It also concludes BreakdownOnSpace and BreakdownOnTorus. The quantitative torus trajectory and its convergence are not obtained. |
| Lemma 7.4 | `NavierStokes.lemma_7_4` | reduced | `Breakdown.Cert.Internal.FreeEnergyLocal.exists_energyCurve`<br>`Breakdown.Cert.freeInvHolds_of` | Quantifies over the constructed free inverse, not all physical perturbations. Gives a continuous X representative, its integrated energy identity and the inequality, but does not explicitly conclude local absolute continuity, the almost-everywhere differentiated identity or the period pairing equality. |
| Proposition 7.5 | `NavierStokes.proposition_7_5` | reduced | `Breakdown.Cert.freeInvHolds_of`<br>`Breakdown.Cert.freeEquivariantHolds_of`<br>`Breakdown.Cert.periodContinuityHolds_of` | States existence and symmetry preservation of the constructed bounded inverse and weak graph convergence with boundedness explicit. Does not identify the whole paper domain with its range or conclude full-sequence local strong convergence. |
| Lemma 7.6 | `NavierStokes.lemma_7_6` | reduced | `Breakdown.Cert.sliceSupBoundHolds_of`<br>`Breakdown.Cert.productBoundHolds_of`<br>`Breakdown.Cert.Internal.ProductBound.slice_real_le` | The spatial bound is the displayed weighted bound in graph norms; the time-dependent estimate allows two different graph fields and also bounds the projected product. Its gradient supremum is essential and its domain is the authors’ graph representation. |
| Lemma 7.7 | `NavierStokes.lemma_7_7` | reduced | `Breakdown.Cert.extendedConvectionHolds_of`<br>`Breakdown.Cert.extendedInvarianceHolds_of`<br>`Breakdown.Cert.extendedConvectionCompactHolds_of` | Bounds and compactness concern convection after solenoidal projection on the graph domain. No unprojected compactness conclusion or restriction that the bound depends only on the one displayed approximate-profile constant is asserted. |
| Proposition 7.8 | `NavierStokes.proposition_7_8` | reduced | `Breakdown.Cert.extendedBorderedInvertibleHolds_of` | Uses forcing f with v=freeInv(S(alpha),f), and states all four normalization equalities explicitly. The bijection is expressed as existence and uniqueness in forcing coordinates, not on all supplied physical perturbations. |
| Proposition 7.9 | `NavierStokes.proposition_7_9` | reduced | `Breakdown.Cert.extendedSupBoundHolds_of` | Controls the essential gradient supremum of the constructed inverse and the projected bordered residual. The printed statement quantifies over every admissible physical perturbation and the supremum of its continuous representative. |
| Proposition 7.10 | `NavierStokes.proposition_7_10` | reduced | `Breakdown.Cert.extendedExistsZeroHeldHolds_of`<br>`Breakdown.Cert.extendedUnitWeightHolds`<br>`Breakdown.Cert.extendedAtProfileHolds` | The held solution is for the certificate after unit-weight and at-profile reductions, with essential gradient bound. Its multiplier correction is explicitly related to the original multiplier by beta=-omega*beta_a. |
| Proposition 7.11 | `NavierStokes.proposition_7_11` | reduced | `Breakdown.WeakProfile.weakOrbitOfParts_holds`<br>`Breakdown.FarField.smoothFieldOfOrbit_holds`<br>`Breakdown.FarField.integralEquationOfOrbit_holds`<br>`Breakdown.FarField.farFieldDecay_holds` | Uses IsSigmaProfile, including uniform L6 and gradient bounds and an explicit square-integrable weak Hessian. The specified continuous X representative is an explicit hypothesis. The output retains the input period and agrees with this input at every time, with additional Hessian and pressure-gradient decay. |
| Proposition B.1 | `NavierStokes.proposition_B_1` | reduced | `Breakdown.CoerciveWeak.pieceMultiplierDensityWeakHolds_proof` | General admissible analytic weights and periodic weak perturbations; c and w₀ remain parameters; the density inequality is stated using positive/negative extended integrals. Set c=3/50 and w=w₀=39/50 to recover the printed constants. |
| Lemma B.2 | `NavierStokes.lemma_B_2` | reduced | `Breakdown.CoerciveWeak.extendedCoerciveClause_of_pieceData_proved` | The formal weak perturbation class and explicit regularity/admissibility hypotheses replace the paper’s informal references. The row lower estimate is assumed for all parameters. The constants remain symbolic. |
| Lemma B.3 | `NavierStokes.lemma_B_3` | reduced | `Breakdown.CertCell.modeDensityBridge_closed` | The two nonnegative 4π identities are asserted separately, including infinite values. The paper writes a signed identity after assuming the negative integral finite. |
| Proposition B.4 | `NavierStokes.proposition_B_4` | reduced | `Breakdown.CertCell.cellJunctions_closed`<br>`Breakdown.CertCell.formNegFinite`<br>`Breakdown.CertCell.cellFormAssembly_closed`<br>`Breakdown.CellLayerSystem.layerJunctionFacts_of_parts`<br>`Breakdown.CertCell.coefficientLowerBounds_of_entries`<br>`Breakdown.CertCell.admissible_of_hypothesis` | Uses all formal cell-system conditions and retains the source pressure/cell-state representation. Cell inequalities use positive and negative parts with row shares, strain slack, credit and actuator cost; the four printed remainder numbers are not reconstructed. The displayed exterior stretching inequality and square Hardy constant are available in component proofs, not extracted as separate clauses here. |
| Lemma B.5 | `NavierStokes.lemma_B_5` | reduced | `Breakdown.CertCell.TailBand.angularModeBounds`<br>`Breakdown.CertCell.Assembly.offModeConditionSound_holds` | The four angular bounds and the nonnegativity consequence under the coefficient test are explicit. The intermediate lower bound (B.36), written with f₁*, is not separately asserted. |
| Lemma B.6 | `NavierStokes.lemma_B_6` | reduced | `Breakdown.CertCell.TailBand.modeRayInverseSquare`<br>`Breakdown.CertCell.TailBand.angularModeBounds`<br>`Breakdown.CertCell.TailBand.pointwiseQuadraticTest`<br>`Breakdown.CertCell.TailBand.uniformCoefficientBounds`<br>`Breakdown.CertCell.TailBand.labelGradFinite`<br>`Breakdown.CertCell.TailBand.modeSquareInverseSquare_of_smooth`<br>`Breakdown.CertCell.TailBand.squareExteriorSmoothStatement`<br>`Breakdown.CertCell.TailBand.Internal.ExteriorLinks.lintegral_neg_le` | The ray radius is measurable and lies between two positive finite constants; the square case requires the source reflection condition. The signed integral is represented by a finite negative integral bounded by the positive integral. The new proof exposes negative-part finiteness, which the source theorem’s conclusion omits. |
| Lemma B.7 | `NavierStokes.lemma_B_7` | reduced | `Breakdown.CertCell.Certificate.signedTreeLowerBound`<br>`Breakdown.CertCell.Certificate.pivotCountPositive` | Retains the nonnegative root passed form in the lower bound; dropping it gives the printed inequality. The conclusion now explicitly states strict positivity on every nonzero vector orthogonal to all negative columns and also retains the dimension bound. |
| Proposition B.8 | `NavierStokes.proposition_B_8` | reduced | `Breakdown.CertCell.rowRestClause_closed` | Assumes the full formal cell-system conditions and uses periodic weak perturbations. The formal estimate is expressed in nonnegative extended integrals with stored coercivity/pin weights. |
| Lemma B.9 | `NavierStokes.lemma_B_9` | reduced | `Breakdown.CertReduction.gapTransferBridgeHolds_proof`<br>`Breakdown.CertReduction.formShiftBridgeHolds_proof`<br>`Breakdown.CertReduction.frozenFormBridgeHolds_of_convection`<br>`Breakdown.CertReduction.convectionIdentity_holds` | Uses a finite decomposition into differences with L²/L³ derivative bounds, with all measurability and derivative-identification hypotheses stated in the corresponding structures. The two-piece specialization gives the printed coefficient budgets. |
| Lemma B.10 | `NavierStokes.lemma_B_10` | reduced | `Breakdown.CertReduction.adjointQuadTerm_of`<br>`Breakdown.CertReduction.matrixFacts`<br>`Breakdown.CertReduction.perturbationSliceHolds`<br>`Breakdown.CertReduction.energyBoundsHolds_proof`<br>`Breakdown.CertReduction.cubicWeightProductHolds`<br>`Breakdown.CertReduction.periodGlue` | The statement bounds the integral of the product of norms, which is stronger than the absolute pairing estimate, and allows any measurable test field with the stated uniform L²/L³ bound. Its Boolean parameter selects the two analytic cases. |
| Lemma B.11 | `NavierStokes.lemma_B_11` | open | `Breakdown.AdjointDefect.dualBoundedBound_of_parts`<br>`Breakdown.AdjointDefect.remainderPlainHolds_proof`<br>`Breakdown.AdjointDefect.remainderAzimuthalHolds_proof`<br>`Breakdown.AdjointDefect.weightedPairingIntegrable_proof` | The target retains joint absolute integrability. A companion proof implementation, NavierStokes.lemma_B_11_iterated, currently supplies almost-everywhere slice integrability, integrability of the signed spatial integral in time and the dual estimate. |
| Lemma B.12 | `NavierStokes.lemma_B_12` | reduced | `Breakdown.AdjointDefect.adjointDefectBridge_of_pieces`<br>`Breakdown.AdjointDefect.representationHolds_of_density`<br>`Breakdown.AdjointDefect.testFieldDensityHolds_proof`<br>`Breakdown.AdjointDefect.potentialBoundHolds_proof`<br>`Breakdown.AdjointDefect.dualBoundedBound_of_parts`<br>`Breakdown.AdjointDefect.remainderPlainHolds_proof`<br>`Breakdown.AdjointDefect.remainderAzimuthalHolds_proof`<br>`Breakdown.AdjointDefect.pinChargeHolds_proof`<br>`Breakdown.AdjointDefect.freeShiftBoundHolds_proof` | The formal adjoint/flow/potential regularity and decomposition hypotheses are explicit. The coefficient budget is the stored defectSum plus pinCharge inequality, including the fitted/free parameter split. |
| Lemma B.13 | `NavierStokes.lemma_B_13` | reduced | `Breakdown.CellReduction.Instantiation.offsetClause_holds_of`<br>`Breakdown.CellReduction.Instantiation.stepPhase_holds`<br>`Breakdown.CellReduction.Instantiation.pressureFieldRegular_holds`<br>`Breakdown.CellReduction.Instantiation.offsetBallIdentity_holds` | The shape and pressure representation and the residual-expansion identities are explicit prerequisites. The error sum (B.59) is represented by the bound in IsOffsetExpansionEntry and the stored adjointOffset. |
| Proposition B.14 | `NavierStokes.proposition_B_14` | reduced | `Breakdown.CellLayerSystem.isExtendedCertificate_of_parts`<br>`Breakdown.CellReduction.Instantiation.instantiation_holds_of_open`<br>`Breakdown.CellReduction.Instantiation.offsetClause_holds_of`<br>`Breakdown.CertReduction.gapTransferBridgeHolds_proof`<br>`Breakdown.CertReduction.formShiftBridgeHolds_proof`<br>`Breakdown.CertReduction.frozenFormBridgeHolds_of_convection`<br>`Breakdown.CertReduction.adjointQuadraticBridge_of`<br>`Breakdown.AdjointDefect.adjointDefectBridge_of_pieces`<br>`Breakdown.CellReduction.Instantiation.adjointStructure_holds_of`<br>`Breakdown.CertReduction.smoothShiftPiecesHolds`<br>`Breakdown.PotentialShape.potentialParts_holds` | The conclusion chooses a common decay constant: ∃ decay, IsExtendedCertificate {D.cert with decay := decay}. It does not assert that D.cert is valid with its original stored decay field. All formal cell-system conditions are retained. |

## Files and ownership

- `lean/EditionStatements.lean` is the proof-layer entry point; `lean/OpenTargets.lean` holds every open numbered proposition.
- `lean/MainTheorems.lean`, `lean/PhysicalStatement.lean` and `lean/SpatialScaling.lean` give the main entrance statements and the physical error conversion.
- `lean/SectionsTwoSix.lean`, `lean/SectionSeven.lean` and `lean/AppendixB.lean` contain the numbered implementations; their additional definition modules state the open mathematics concretely.
- `support/theorem11/` is the whole-space Theorem 1.1 wrapper from `lean-wrappers/navier-stokes/theorem11/`, copied so that this layer builds on its own.
- `support/theorem71/` contains the added witness-retaining modules and the downstream wrapper. `provenance.json` records the three formerly patched authors’ files, all unchanged here.
- `comparison/` contains the fixed challenge template, the weaker solution and individual negative-control configurations.
- `upstream-pins.json` pins the bytes of every file of the authors' package that the installer checks.

Credit: original edition statements and bridge proofs prepared by Will Cook with AI assistance, using the mathematics and Lean proofs of Levent Alpöge and Tristan Buckmaster and the proof-reader wrappers. The authors have not reviewed these changes. See `CREDIT.md`.
