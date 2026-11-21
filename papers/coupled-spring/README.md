<!-- Written by tools/markdown_edition.py from paper.md, links.json and the Lean. Edit those, then run it again. -->

# The minimum of the coupled spring potential

Completing the square writes the coupled spring potential
U(x₀, x₁) = x₀² + x₀x₁ + x₁² as

U(x) = (x₀ + ½x₁)² + ¾x₁²,

so U is zero at the origin and positive everywhere else. In PhyslibAlpha,
Bjørn Kjos-Hanssen proves that the origin is a local minimum by a longer
route. He formalised a general second-derivative test in a companion file,
applied it to U, and describes the result as a proof of concept for the
test.

<details>
<summary><b>Lean</b> · 2 statements: The coupled spring potential; The coupled spring potential equals `(x₀ + x₁/2)² + (3/4) x₁²` at every point</summary>

**The coupled spring potential** · `couplingPotential`

```lean
/-- The potential energy of a pair of coupled springs. -/
noncomputable def couplingPotential (x : EuclideanSpace ℝ (Fin 2)) : ℝ :=
  (x 0) ^ 2 + x 0 * x 1 + (x 1) ^ 2
```

Copied whole from [CoupledSpringPotential.lean, lines 56–57][couplingPotential] in Physlib at be0a9ee.

**The coupled spring potential equals `(x₀ + x₁/2)² + (3/4) x₁²` at every point** · `couplingPotential_eq_sq_add_sq`

```lean
/-- The coupled spring potential equals `(x₀ + x₁/2)² + (3/4) x₁²` at every point. -/
theorem couplingPotential_eq_sq_add_sq (x : EuclideanSpace ℝ (Fin 2)) :
    couplingPotential x = (x 0 + x 1 / 2) ^ 2 + 3 / 4 * (x 1) ^ 2 := by
  unfold couplingPotential
  ring
```

Lean accepted this supplementary proof, written with AI for this page. [checks/GlobalMinimum.lean, lines 3–7][couplingPotential_eq_sq_add_sq].

</details>

For this function every quantity the test uses can be computed by hand,
so the proof doubles as a worked example of the test. The sections below
follow it in order: what the test requires (§1) and how its proof turns a
positive Hessian into a minimum (§2). Then come a perturbed potential for
which the completed square no longer settles the question (§3) and a
hypothesis of the test's remainder lemma that its proof does not need (§4).
The last two sections derive U from three springs and describe the
motion it governs.

[Read it with the Lean beside it](https://wcook04.github.io/proof-reader/#/coupled-spring) · [Editable Markdown](paper.md) · [Lean source](https://github.com/leanprover-community/physlib/tree/be0a9eef7dac78da524bfbde91c812340b194610)

## 1. What the test requires

**PhyslibAlpha theorem.** The coupled spring potential U has a local minimum
at the origin. In symbols, U(0) ≤ U(x) for all x in some neighbourhood
of 0.

<details>
<summary><b>PhyslibAlpha</b> · Local minimum at the origin · <code>coupled_spring_potential</code></summary>

```lean
lemma coupled_spring_potential :
    let U := fun x : EuclideanSpace ℝ (Fin 2) => (x 0)^2 + x 0 * x 1 + (x 1)^2
    IsLocalMin U {
        ofLp := ![0,0]
    } := by
```

Statement copied from [CoupledSpringPotential.lean, lines 153–160][coupled_spring_potential] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** The Lean theorem writes out the polynomial in a let expression and states IsLocalMin at the zero vector. That means U(0) ≤ U(x) on a neighbourhood. The global inequality has its own passage and proof.

</details>

Kjos-Hanssen derives it from the following test. Let f be real-valued on a
finite-dimensional real inner product space. If f is analytic at a, its
gradient vanishes at a, and D²f(a)[h, h] > 0 for every h ≠ 0, then f
has a local minimum at a.

<details>
<summary><b>PhyslibAlpha</b> · Analytic second derivative test · <code>second_derivative_test_analyticAt</code></summary>

```lean
/--
A more convenient form of the second partial derivative test: it suffices that `f`
is analytic at `x₀` (so that an explicit power series need not be produced by hand).
-/
theorem second_derivative_test_analyticAt {V : Type*} [NormedAddCommGroup V]
    [InnerProductSpace ℝ V] [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V}
    (h₀ : gradient f x₀ = 0) (han : AnalyticAt ℝ f x₀)
    (hf : (iteratedFDerivQuadraticMap f x₀).PosDef) : IsLocalMin f x₀ := by
```

Statement copied from [PartialDerivativeTest.lean, lines 600–606][second_derivative_test_analyticAt] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** Lean takes a finite-dimensional real inner product space, analyticity and zero gradient at the point, and PosDef of the map h ↦ D²f(a)[h,h]. Its conclusion is IsLocalMin, with a weak inequality on a neighbourhood.

</details>

For a quadratic, all three hypotheses can be read off a single expansion.
U is a polynomial, so it is analytic at every point. Expanding U(x + h)
gives U(x) + DU(x)[h] + U(h), where

DU(x)[h] = (2x₀ + x₁)h₀ + (x₀ + 2x₁)h₁.

<details>
<summary><b>PhyslibAlpha</b> · 2 statements: The potential is analytic; Derivative of the potential</summary>

**The potential is analytic** · `couplingPotential_analyticAt`

```lean
/-
The coupling potential is analytic everywhere (it is a polynomial).
-/
lemma couplingPotential_analyticAt (z : EuclideanSpace ℝ (Fin 2)) :
    AnalyticAt ℝ couplingPotential z := by
```

Statement copied from [CoupledSpringPotential.lean, lines 68–75][couplingPotential_analyticAt] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** The point z is arbitrary in EuclideanSpace ℝ (Fin 2). Lean proves analyticity at each such point.

**Derivative of the potential** · `couplingPotential_hasFDerivAt`

```lean
/-
The derivative of the coupling potential at any point, as an explicit
linear functional.
-/
lemma couplingPotential_hasFDerivAt (x : EuclideanSpace ℝ (Fin 2)) :
    HasFDerivAt couplingPotential
      ((2 * x 0 + x 1) • (EuclideanSpace.proj (𝕜 := ℝ) 0)
        + (x 0 + 2 * x 1) • (EuclideanSpace.proj (𝕜 := ℝ) 1)) x := by
```

Statement copied from [CoupledSpringPotential.lean, lines 81–92][couplingPotential_hasFDerivAt] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** Lean defines the continuous linear map as (2x₀+x₁) times the first coordinate projection plus (x₀+2x₁) times the second. Applying that map to h gives the displayed derivative.

</details>

The remainder is U itself, evaluated at the increment. Its three-square
form, which §5 derives from the springs,

U(h) = ½(h₀² + h₁² + (h₀ + h₁)²),

together with (h₀ + h₁)² ≤ 2‖h‖² gives
0 ≤ U(h) ≤ (3/2)‖h‖². So U(h)/‖h‖ tends to
zero with h, and the linear term is the derivative. Both of its
coefficients vanish at x = 0, so the gradient at the origin is zero. The
coefficients are linear in x, so the Hessian is the same matrix at every
point.

<details>
<summary><b>PhyslibAlpha</b> · Zero gradient at the origin · <code>couplingPotential_gradient_zero</code></summary>

```lean
/-
The gradient of the coupling potential vanishes at the origin.
-/
lemma couplingPotential_gradient_zero :
    gradient couplingPotential (!₂[0, 0] : EuclideanSpace ℝ (Fin 2)) = 0 := by
```

Statement copied from [CoupledSpringPotential.lean, lines 97–101][couplingPotential_gradient_zero] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** Lean states gradient couplingPotential !₂[0, 0] = 0. The vector !₂[0, 0] is the origin of the Euclidean plane.

</details>

K = [[2, 1], [1, 2]].

<details>
<summary><b>PhyslibAlpha</b> · Second derivative of the potential · <code>couplingPotential_iteratedFDeriv_two</code></summary>

```lean
/-
The value of the second derivative quadratic map of the coupling potential.
-/
lemma couplingPotential_iteratedFDeriv_two (z : EuclideanSpace ℝ (Fin 2))
    (a b : EuclideanSpace ℝ (Fin 2)) :
    iteratedFDeriv ℝ 2 couplingPotential z ![a, b]
      = 2 * a 0 * b 0 + a 0 * b 1 + a 1 * b 0 + 2 * a 1 * b 1 := by
```

Statement copied from [CoupledSpringPotential.lean, lines 106–130][couplingPotential_iteratedFDeriv_two] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** Lean evaluates the second derivative on two arbitrary vectors. The four coefficients of the resulting bilinear expression give the entries of K, independent of the base point z.

</details>

Putting the same vector in both slots of the second derivative gives back
twice the remainder.

hᵀKh = 2U(h) = h₀² + h₁² + (h₀ + h₁)².

The Hessian at the origin is positive definite. In fact
hᵀKh ≥ ‖h‖², with equality exactly when h₀ = −h₁, where
the last square vanishes.

<details>
<summary><b>PhyslibAlpha</b> · Positive Hessian at the origin · <code>couplingPotential_posDef</code></summary>

```lean
/-
The second derivative quadratic map of the coupling potential is positive definite
at the origin.
-/
lemma couplingPotential_posDef :
    (iteratedFDerivQuadraticMap couplingPotential
    (!₂[0, 0] : EuclideanSpace ℝ (Fin 2))).PosDef := by
```

Statement copied from [CoupledSpringPotential.lean, lines 142–151][couplingPotential_posDef] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** Lean asserts positivity of the Hessian quadratic map at the origin on nonzero vectors. The lower bound by ‖h‖² in the next sentence follows from the displayed squares.

</details>

## 2. How the test turns a positive Hessian into a minimum

Write Q(h) = D²f(a)[h, h]. Lean packages Q as a quadratic map, so one
lower-bound lemma serves every positive-definite Q of this form. On the
compact unit sphere the continuous function Q is positive, so it attains a
positive minimum C there, and scaling gives Q(h) ≥ C‖h‖²
for every h. A zero-dimensional space contains only the point a, and
Lean handles it separately.

<details>
<summary><b>PhyslibAlpha</b> · 3 statements: The Hessian quadratic form; Positive Hessian lower bound; Local minimum on a singleton</summary>

**The Hessian quadratic form** · `iteratedFDerivQuadraticMap`

```lean
/-- The second iterated Frechét derivative as a quadratic map. -/
noncomputable def iteratedFDerivQuadraticMap {V : Type*} [NormedAddCommGroup V]
    [NormedSpace ℝ V] (f : V → ℝ) (x₀ : V) : QuadraticMap ℝ V ℝ := {
  toFun := fun y => iteratedFDeriv ℝ 2 f x₀ ![y,y]
  exists_companion' := ⟨hessianBilinearCompanion f x₀, fun x y => by
    have ha (u v b) := (iteratedFDeriv ℝ 2 f x₀).map_update_add' ![u,v] b x y
    have ha₀ := ha x (x + y) 0
    have ha₁ (u) := ha u x 1
    simp only [update₀, MultilinearMap.toFun_eq_coe, coe_coe, update₁, hessianBilinearCompanion]
        at ha₀ ha₁ ha ⊢
    rw [ha₀, ha₁, ha₁, add_assoc, add_assoc]
    apply add_left_cancel_iff.mpr
    rw [← add_assoc, add_comm]
    simp⟩
  toFun_smul := fun u v => by
    have hsm (b c) := (iteratedFDeriv ℝ 2 f x₀).map_update_smul' ![b,v] c u v
    have hsm₀ := hsm v 0
    have hsm₁ := hsm (u • v) 1
    simp only [update₀, update₁, MultilinearMap.toFun_eq_coe, coe_coe, smul_eq_mul]
        at hsm₀ hsm₁ hsm
    rw [smul_eq_mul, mul_assoc, ← hsm₀, hsm₁]}
```

Copied whole from [PartialDerivativeTest.lean, lines 107–126][iteratedFDerivQuadraticMap] in Physlib at be0a9ee.

**Positive Hessian lower bound** · `coercive_of_posdef`

```lean
/-- Positive definiteness implies coercivity. -/
lemma coercive_of_posdef {V : Type*} [NormedAddCommGroup V] [NormedSpace ℝ V]
    [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V}
    (hf' : (iteratedFDerivQuadraticMap f x₀).PosDef) :
    IsCoercive (continuousBilinearMapOfContinuousMultilinearMap
        (iteratedFDeriv ℝ 2 f x₀)) := by
```

Statement copied from [PartialDerivativeTest.lean, lines 455–505][coercive_of_posdef] in Physlib at be0a9ee; the proof is at the link.

**Local minimum on a singleton** · `isLocalMin.of_subsingleton`

```lean
lemma isLocalMin.of_subsingleton {V : Type*} [TopologicalSpace V]
    [Subsingleton V] {f : V → ℝ} {x₀ : V} : IsLocalMin f x₀ := by
```

Statement copied from [PartialDerivativeTest.lean, lines 571–573][isLocalMin.of_subsingleton] in Physlib at be0a9ee; the proof is at the link.

</details>

At a critical point Taylor's theorem reads
f(a + h) − f(a) = ½Q(h) + R(h), and the power-series lemma gives
R(h) = o(‖h‖²). So for each ε > 0 some neighbourhood of
0 has |R(h)| ≤ ε‖h‖² throughout. Lean states this
as a little-o bound along the neighbourhood filter `nhds`, which lets the
proof fix ε first and take the neighbourhood afterwards. With
ε = C/2 the remainder can cancel at most the quadratic lower bound,
so f(a + h) ≥ f(a) throughout that neighbourhood, which is Lean's
`IsLocalMin`. With ε = C/4 the same estimate gives
f(a + h) − f(a) ≥ ¼C‖h‖², which is strict for h ≠ 0.

<details>
<summary><b>PhyslibAlpha</b> · 2 statements: Taylor error from a power series; Comparison from the Taylor error</summary>

**Taylor error from a power series** · `littleO_of_powerseries`

```lean
/-- Having a power series implies quadratic approximation. -/
lemma littleO_of_powerseries {V : Type*} [NormedAddCommGroup V] [NormedSpace ℝ V]
    {f : V → ℝ} {x₀ : V} {p : FormalMultilinearSeries ℝ V ℝ}
    {r : NNReal} (h : HasFPowerSeriesOnBall f p x₀ r) :
    (fun x => f x - p.partialSum 3 (x - x₀)) =o[nhds x₀] fun x => ‖x - x₀‖ ^ 2 := by
```

Statement copied from [PartialDerivativeTest.lean, lines 558–568][littleO_of_powerseries] in Physlib at be0a9ee; the proof is at the link.

**Comparison from the Taylor error** · `le_of_littleO`

```lean
theorem le_of_littleO {V : Type*}
    [NormedAddCommGroup V] [InnerProductSpace ℝ V]
    {f : V → ℝ} {x₀ x : V} {C : ℝ}
    (hx : C * (‖x - x₀‖ ^ 2) ≤ iteratedFDeriv ℝ 2 f x₀ fun _ ↦ x - x₀)
    (hx₀ : fderiv ℝ f x₀ x = fderiv ℝ f x₀ x₀)
    (h₁ : ‖f x - ∑ i ∈ range 3, 1 / ↑i ! * iteratedFDeriv ℝ i f x₀ fun _ ↦ x - x₀‖
      ≤ C / 2 * ‖x - x₀‖ ^ 2) :
  f x₀ ≤ f x := by
```

Statement copied from [PartialDerivativeTest.lean, lines 514–530][le_of_littleO] in Physlib at be0a9ee; the proof is at the link.

</details>

For U every number in this argument is explicit. The minimum of hᵀKh
on the unit circle is the smaller eigenvalue of K, so C = 1, attained at
±(1, −1)/√2. The remainder is identically zero, so the inequality
holds on the whole plane, although the test reports only a local minimum.

## 3. A remainder that matters

Now add a cubic and set W(x) = U(x) + x₀³. The cubic has zero gradient and
zero Hessian at the origin, so W has the same gradient and the same K
there, and W is still a polynomial. A supplementary Lean proof applies
Kjos-Hanssen's analytic test to W unchanged. Its only new step shows
that the second derivative of x₀³ vanishes at the origin.

<details>
<summary><b>Supplementary Lean</b> · 2 statements: Adding `x₀³` keeps a local minimum at the origin. The proof applies the analytic second-derivative test from PhyslibAlpha, the test that proves the original theorem; The cubic `x₀³` has zero second derivative at the origin</summary>

**Adding `x₀³` keeps a local minimum at the origin. The proof applies the analytic second-derivative test from PhyslibAlpha, the test that proves the original theorem** · `cubicPerturbation_isLocalMin`

```lean
/-- Adding `x₀³` keeps a local minimum at the origin. The proof applies the analytic
second-derivative test from PhyslibAlpha, the test that proves the original theorem. -/
theorem cubicPerturbation_isLocalMin :
    IsLocalMin cubicPerturbation (0 : EuclideanSpace ℝ (Fin 2)) :=
  second_derivative_test_analyticAt cubicPerturbation_gradient_zero
    (cubicPerturbation_analyticAt 0) cubicPerturbation_posDef
```

Lean accepted this supplementary proof, written with AI for this page. [checks/CubicPerturbation.lean, lines 66–71][cubicPerturbation_isLocalMin].

**The cubic `x₀³` has zero second derivative at the origin** · `cube_iteratedFDeriv_two_zero`

```lean
/-- The cubic `x₀³` has zero second derivative at the origin. -/
lemma cube_iteratedFDeriv_two_zero (a b : EuclideanSpace ℝ (Fin 2)) :
    iteratedFDeriv ℝ 2 (fun x : EuclideanSpace ℝ (Fin 2) => (x 0) ^ 3) 0 ![a, b] = 0 := by
  have hcomp : (fun x : EuclideanSpace ℝ (Fin 2) => (x 0) ^ 3)
      = (fun t : ℝ => t ^ 3) ∘ (EuclideanSpace.proj (𝕜 := ℝ) (0 : Fin 2)) := rfl
  have hcd : ContDiff ℝ ⊤ (fun t : ℝ => t ^ 3) := contDiff_id.pow 3
  rw [hcomp, (EuclideanSpace.proj (𝕜 := ℝ) (0 : Fin 2)).iteratedFDeriv_comp_right hcd _ le_top]
  simp [iteratedFDeriv_apply_eq_iteratedDeriv_mul_prod, iteratedDeriv_pow]
```

Lean accepted this supplementary proof, written with AI for this page. [checks/CubicPerturbation.lean, lines 8–15][cube_iteratedFDeriv_two_zero].

</details>

The remainder is now the cubic, and the numbers from §2 show how far the
conclusion reaches. Since |x₀³| ≤ |x₀| ‖x‖², the
ε = C/2 bound holds wherever |x₀| ≤ ½ and the
ε = C/4 bound wherever |x₀| ≤ ¼. In the second region,
using U(x) ≥ ½‖x‖²,

W(x) ≥ ¼‖x‖²,

so the origin is a strict local minimum. A second supplementary proof
checks the strict inequality near the origin in Lean.

<details>
<summary><b>Supplementary Lean</b> · Near the origin the minimum is strict: if `|x₀| < 1/4` and `x ≠ 0`, the perturbed potential is positive, because it is at least `(x₁ + x₀/2)² + x₀²/2` · <code>cubicPerturbation_strict_near_origin</code></summary>

```lean
/-- Near the origin the minimum is strict: if `|x₀| < 1/4` and `x ≠ 0`, the perturbed
potential is positive, because it is at least `(x₁ + x₀/2)² + x₀²/2`. -/
theorem cubicPerturbation_strict_near_origin :
    ∀ᶠ x in nhds (0 : EuclideanSpace ℝ (Fin 2)),
      x ≠ 0 → cubicPerturbation 0 < cubicPerturbation x := by
  have hc : Continuous (fun x : EuclideanSpace ℝ (Fin 2) => x 0) :=
    (EuclideanSpace.proj (𝕜 := ℝ) (0 : Fin 2)).continuous
  have ht : Filter.Tendsto (fun x : EuclideanSpace ℝ (Fin 2) => x 0) (nhds 0) (nhds 0) := by
    simpa using hc.tendsto (0 : EuclideanSpace ℝ (Fin 2))
  have hnear : ∀ᶠ x in nhds (0 : EuclideanSpace ℝ (Fin 2)), |x 0| < 1 / 4 := by
    filter_upwards [ht.eventually (Metric.ball_mem_nhds (0 : ℝ) (by norm_num : (0 : ℝ) < 1 / 4))]
      with x hx
    simpa [Metric.mem_ball, Real.dist_eq] using hx
  filter_upwards [hnear] with x hx hne
  have hW0 : cubicPerturbation (0 : EuclideanSpace ℝ (Fin 2)) = 0 := by
    simp [cubicPerturbation, couplingPotential]
  rw [hW0]
  have hlo : -(1 / 4 : ℝ) < x 0 := (abs_lt.mp hx).1
  have hprod : 0 ≤ (x 0) ^ 2 * (x 0 + 1 / 4) := mul_nonneg (sq_nonneg _) (by linarith)
  have hbound : (x 1 + x 0 / 2) ^ 2 + (x 0) ^ 2 / 2 ≤ cubicPerturbation x := by
    unfold cubicPerturbation couplingPotential
    nlinarith [hprod]
  by_contra hlt
  have hle : cubicPerturbation x ≤ 0 := not_lt.mp hlt
  have hs : 0 ≤ (x 1 + x 0 / 2) ^ 2 := sq_nonneg _
  have h0 : x 0 = 0 := by
    have h0sq : (x 0) ^ 2 = 0 := by nlinarith [sq_nonneg (x 0)]
    exact (pow_eq_zero_iff two_ne_zero).mp h0sq
  have h1 : x 1 = 0 := by
    have h1sq : (x 1 + x 0 / 2) ^ 2 = 0 := by nlinarith [sq_nonneg (x 0)]
    have h1lin : x 1 + x 0 / 2 = 0 := (pow_eq_zero_iff two_ne_zero).mp h1sq
    linarith
  apply hne
  ext i
  fin_cases i
  · simpa using h0
  · simpa using h1
```

Lean accepted this supplementary proof, written with AI for this page. [checks/CubicPerturbation.lean, lines 73–109][cubicPerturbation_strict_near_origin].

</details>

On the x₀-axis the exact values are W(t, 0) = t²(1 + t). They are positive
for −1 < t < 0 and zero at t = −1, and they decrease without bound as t
decreases further. For example W(−2, 0) = −4 < W(0), which Lean also checks,
so W has no global minimum. On the negative half of this axis the
inequality W ≥ W(0) holds out to t = −1, twice as far as the region the
test guarantees. Given the zero gradient and analyticity, whether the
origin is a local minimum of W is settled by K alone, and the cubic
changes only the size of the neighbourhood.

<details>
<summary><b>Supplementary Lean</b> · The origin is not a global minimum after adding `x₀³`: the value at `(-2, 0)` is `-4` · <code>cubicPerturbation_not_global</code></summary>

```lean
/-- The origin is not a global minimum after adding `x₀³`: the value at `(-2, 0)` is `-4`. -/
theorem cubicPerturbation_not_global :
    cubicPerturbation (!₂[-2, 0] : EuclideanSpace ℝ (Fin 2))
      < cubicPerturbation (0 : EuclideanSpace ℝ (Fin 2)) := by
  simp [cubicPerturbation, couplingPotential]
  norm_num
```

Lean accepted this supplementary proof, written with AI for this page. [checks/CubicPerturbation.lean, lines 111–116][cubicPerturbation_not_global].

</details>

## 4. A hypothesis the proof does not need

PhyslibAlpha's remainder lemma, `isLocalMin_of_posDef_of_littleo`, takes
the little-o estimate, the zero gradient and positive definiteness, and
also `ContDiffAt ℝ ⊤ f a`, smoothness of all orders at a. Its proof
obtains the lower bound Q(h) ≥ C‖h‖² twice. The first call,
to `coercive_of_posdef`, uses only positive definiteness. The second, to
`coercive_of_posdef_of_contdiff`, uses smoothness and replaces the constant
from the first. The rest of the proof uses only the values Q(h), and the
first call already bounds those.

<details>
<summary><b>PhyslibAlpha</b> · 2 statements: Minimum from the Taylor remainder; Lower bound under smoothness</summary>

**Minimum from the Taylor remainder** · `isLocalMin_of_posDef_of_littleo`

```lean
/-- Second partial derivative test, "little oh" form. -/
theorem isLocalMin_of_posDef_of_littleo {V : Type*} [NormedAddCommGroup V]
    [InnerProductSpace ℝ V] [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V}
    (h : (fun x => f x - ∑ i ∈ range 3, 1 / (i)! * iteratedFDeriv ℝ i f x₀ fun _ => x - x₀)
      =o[nhds x₀] fun x => ‖x - x₀‖ ^ 2) (h₀ : gradient f x₀ = 0) (hcd : ContDiffAt ℝ ⊤ f x₀)
    (hf : (iteratedFDerivQuadraticMap f x₀).PosDef) : IsLocalMin f x₀ := by
```

Statement copied from [PartialDerivativeTest.lean, lines 534–554][isLocalMin_of_posDef_of_littleo] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: lean is weaker.** The page's argument needs the Taylor estimate, a zero gradient and a positive definite second derivative. The Lean statement also assumes ContDiffAt ℝ ⊤ f x₀, so it says less than the argument gives. Its proof obtains the lower bound from coercive_of_posdef and again from coercive_of_posdef_of_contdiff, and only the second uses the extra hypothesis. The supplementary Lean proof reaches the same conclusion without it.

**Lower bound under smoothness** · `coercive_of_posdef_of_contdiff`

```lean
/-- Positive definiteness implies coercivity.
  The proof uses the general fact `coercive_of_posdefHalf`
  but requires a differentiability assumption on `f`.
-/
lemma coercive_of_posdef_of_contdiff {V : Type*}
    [NormedAddCommGroup V] [NormedSpace ℝ V]
    [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V}
    (hf : ContDiffAt ℝ ⊤ f x₀)
    (hf' : (iteratedFDerivQuadraticMap f x₀).PosDef) :
    IsCoercive (continuousBilinearMapOfContinuousMultilinearMap
        (iteratedFDeriv ℝ 2 f x₀)) := by
```

Statement copied from [PartialDerivativeTest.lean, lines 432–452][coercive_of_posdef_of_contdiff] in Physlib at be0a9ee; the proof is at the link.

</details>

Smoothness enters through a symmetry step. Write B(u, v) = D²f(a)[u, v], so
that Q(h) = B(h, h). Expanding B(u + v, u + v) gives the polar identity

Q(u + v) − Q(u) − Q(v) = B(u, v) + B(v, u).

<details>
<summary><b>PhyslibAlpha</b> · Polar form of the Hessian · <code>polarBilin_iteratedFDerivQuadraticMap</code></summary>

```lean
/--
The polar bilinear form of the second-derivative quadratic map is the symmetrized
Hessian.
-/
lemma polarBilin_iteratedFDerivQuadraticMap {V : Type*} [NormedAddCommGroup V] [NormedSpace ℝ V]
    (f : V → ℝ) (x₀ : V) (x y : V) :
    (iteratedFDerivQuadraticMap f x₀).polarBilin x y
      = iteratedFDeriv ℝ 2 f x₀ ![x, y] + iteratedFDeriv ℝ 2 f x₀ ![y, x] := by
```

Statement copied from [PartialDerivativeTest.lean, lines 402–410][polarBilin_iteratedFDerivQuadraticMap] in Physlib at be0a9ee; the proof is at the link.

**Comparison with the page, made by AI and not reviewed: same statement.** The full polar form sums the second derivative on the ordered pairs (u,v) and (v,u). Recovering the Hessian off the diagonal requires halving the sum and using symmetry.

</details>

If B is symmetric, the right side is 2B(u, v), so half the polar form
recovers B itself. PhyslibAlpha proves that symmetry from smoothness,
by Schwarz's theorem. On the diagonal the two terms are equal whether or not B is
symmetric, and the minimum argument evaluates B only on the diagonal.

<details>
<summary><b>PhyslibAlpha</b> · The second derivative is symmetric · <code>iteratedFDeriv_two_swap</code></summary>

```lean
/--
Symmetry of the second iterated Fréchet derivative (Schwarz's theorem).
-/
lemma iteratedFDeriv_two_swap {V : Type*} [NormedAddCommGroup V] [NormedSpace ℝ V]
    {f : V → ℝ} {x₀ : V} (hf : ContDiffAt ℝ ⊤ f x₀) (x y : V) :
    iteratedFDeriv ℝ 2 f x₀ ![y, x] = iteratedFDeriv ℝ 2 f x₀ ![x, y] := by
```

Statement copied from [PartialDerivativeTest.lean, lines 415–425][iteratedFDeriv_two_swap] in Physlib at be0a9ee; the proof is at the link.

</details>

A supplementary Lean proof keeps the little-o estimate, the zero gradient
and positive definiteness, drops the smoothness hypothesis, and reaches the
same conclusion with the first call alone.

<details>
<summary><b>Supplementary Lean</b> · The little-o form of the second-derivative test holds without the smoothness hypothesis: the proof of `isLocalMin_of_posDef_of_littleo` with its use of that hypothesis removed · <code>isLocalMin_of_posDef_of_littleo_without_smoothness</code></summary>

```lean
/-- The little-o form of the second-derivative test holds without the smoothness hypothesis:
the proof of `isLocalMin_of_posDef_of_littleo` with its use of that hypothesis removed. -/
theorem isLocalMin_of_posDef_of_littleo_without_smoothness {V : Type*} [NormedAddCommGroup V]
    [InnerProductSpace ℝ V] [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V}
    (h : (fun x => f x - ∑ i ∈ range 3, 1 / (i)! * iteratedFDeriv ℝ i f x₀ fun _ => x - x₀)
      =o[nhds x₀] fun x => ‖x - x₀‖ ^ 2) (h₀ : gradient f x₀ = 0)
    (hf : (iteratedFDerivQuadraticMap f x₀).PosDef) : IsLocalMin f x₀ := by
  have ⟨C,hC⟩ := coercive_of_posdef hf
  simp only [Asymptotics.IsLittleO, Asymptotics.IsBigOWith] at h
  apply (h (half_pos hC.1)).mono
  intro x
  have hx := hC.2 (x - x₀)
  simp only [continuousBilinearMapOfContinuousMultilinearMap, MultilinearMap.toFun_eq_coe,
    coe_coe, ContinuousLinearMap.coe_mk', LinearMap.coe_mk,
    AddHom.coe_mk] at hx
  rw [mul_assoc,show ![x - x₀, x - x₀] = fun _ => x - x₀ by
    ext i; fin_cases i <;> simp] at hx
  have hx₀ : inner ℝ (gradient f x₀) (x - x₀) = fderiv ℝ f x₀ (x - x₀) := by simp [gradient]
  simp only [h₀, inner_zero_left, map_sub] at hx₀
  simp only [norm_pow, norm_norm]
  rw [← pow_two] at hx
  exact le_of_littleO hx <| sub_eq_zero.mp hx₀.symm
```

Lean accepted this supplementary proof, written with AI for this page. [checks/WithoutSmoothness.lean, lines 5–26][isLocalMin_of_posDef_of_littleo_without_smoothness].

</details>

At the pinned revision the only caller is the power-series test
`second_derivative_test`, which passes `h₁.analyticAt.contDiffAt` to the
remainder lemma. With the weaker lemma that argument could be removed, and
the public statements would stay as they are: the power-series test still
takes a power series and its analytic wrapper still takes analyticity. A
library change could also keep the original signature as a wrapper for
existing callers. The weaker lemma applies to any function whose Taylor
remainder is o(‖h‖²), including twice continuously
differentiable functions, which need not have a power series. A test for
that class would also need the remainder estimate, which is not formalised
here.

<details>
<summary><b>PhyslibAlpha</b> · Power series minimum test · <code>second_derivative_test</code></summary>

```lean
/-- The second partial derivative test. -/
theorem second_derivative_test {V : Type*} [NormedAddCommGroup V] [InnerProductSpace ℝ V]
    [FiniteDimensional ℝ V] {f : V → ℝ} {x₀ : V} {p : FormalMultilinearSeries ℝ V ℝ}
    (h₀ : gradient f x₀ = 0) {r : NNReal}
    (h₁ : HasFPowerSeriesOnBall f p x₀ r)
    (hf : (iteratedFDerivQuadraticMap f x₀).PosDef) : IsLocalMin f x₀ := by
```

Statement copied from [PartialDerivativeTest.lean, lines 576–594][second_derivative_test] in Physlib at be0a9ee; the proof is at the link.

</details>

## 5. Where the three squares come from

Kjos-Hanssen's docstring calls U the potential energy of a pair of
coupled springs. One mechanical model, chosen for this page, has two masses
on a line between fixed walls. A spring connects each mass to its wall,
and a third connects the masses. All three ideal springs have stiffness
k > 0 and are at their natural lengths at the reference positions. Measure
x₀ and x₁ from those positions, with each positive direction pointing
inward.

![Two masses between fixed walls, joined by three springs of stiffness k. Positive x₀ points right and positive x₁ points left.](spring-coordinates.svg)

Moving the left mass inward by x₀ lengthens its wall spring by x₀,
and moving the right mass inward by x₁ lengthens the other wall spring by
x₁. Both inward motions shorten the middle spring, so its change in
length is −(x₀ + x₁). Each spring stores ½k times the square of
its change in length, so the total is kU(x), with one square for each
spring.

U(x) = ½(x₀² + x₁² + (x₀ + x₁)²).

For displacements in metres, U is in square metres and kU in joules.
Since k > 0, multiplying by k does not move the minimum. The wall springs
alone store ½k‖x‖², so U(x) ≥ ½‖x‖²,
the bound used for W in §3, and the stored energy is zero only when both
masses are at their reference positions.

**Global minimum, supplementary proof.** For every nonzero x ∈ ℝ², U(x) > U(0).
Both sides are zero at x = 0. The Lean proof uses the completed square from
the introduction. If (x₀ + ½x₁)² + ¾x₁² = 0, the
second term forces x₁ = 0. The first then forces x₀ = 0.

<details>
<summary><b>Supplementary Lean</b> · 2 statements: At every point other than the origin the coupled spring potential is larger than at the origin; Away from the origin the coupled spring potential is strictly positive</summary>

**At every point other than the origin the coupled spring potential is larger than at the origin** · `couplingPotential_origin_lt`

```lean
/-- At every point other than the origin the coupled spring potential is larger than at the
origin. -/
theorem couplingPotential_origin_lt (x : EuclideanSpace ℝ (Fin 2)) (hx : x ≠ 0) :
    couplingPotential (!₂[0, 0] : EuclideanSpace ℝ (Fin 2)) < couplingPotential x := by
  rw [couplingPotential_origin]
  exact couplingPotential_pos x hx
```

Lean accepted this supplementary proof, written with AI for this page. [checks/GlobalMinimum.lean, lines 48–53][couplingPotential_origin_lt].

**Away from the origin the coupled spring potential is strictly positive** · `couplingPotential_pos`

```lean
/-- Away from the origin the coupled spring potential is strictly positive. -/
theorem couplingPotential_pos (x : EuclideanSpace ℝ (Fin 2)) (hx : x ≠ 0) :
    0 < couplingPotential x := by
  rw [couplingPotential_eq_sq_add_sq]
  by_contra h
  have hs : 0 ≤ (x 0 + x 1 / 2) ^ 2 := sq_nonneg _
  have ht : 0 ≤ (x 1) ^ 2 := sq_nonneg _
  have h1 : x 1 = 0 := by
    have h1sq : (x 1) ^ 2 = 0 := by linarith
    exact (pow_eq_zero_iff two_ne_zero).mp h1sq
  have h0 : x 0 = 0 := by
    have h0sq : (x 0 + x 1 / 2) ^ 2 = 0 := by linarith
    have h0lin : x 0 + x 1 / 2 = 0 := (pow_eq_zero_iff two_ne_zero).mp h0sq
    linarith
  apply hx
  ext i
  fin_cases i
  · first
      | simpa using h0
      | (simp; exact h0)
      | exact h0
  · first
      | simpa using h1
      | (simp; exact h1)
      | exact h1
```

Lean accepted this supplementary proof, written with AI for this page. [checks/GlobalMinimum.lean, lines 22–46][couplingPotential_pos].

</details>

## 6. What the potential says about motion

In this model the force on each mass, measured along its own positive
direction, is −k ∂U/∂xᵢ, so the force vector is
−kKx. For instance, move the left mass inward by d > 0 and hold the right
one at its reference position. The compressed middle spring pushes the
right mass toward its wall, giving force −kd
in its own positive direction.

With equal masses m > 0 and no damping, Newton's law gives
mẍ = −kKx. Displacements along the eigenvectors of K keep their
shape, because K(1, −1)ᵀ = (1, −1)ᵀ and K(1, 1)ᵀ = 3(1, 1)ᵀ. Their
angular frequencies are ω₋ = √(k/m) and ω₊ = √(3k/m).
In the slow motion both masses move in the same physical direction and the
middle spring keeps its length. In the fast motion they move toward and
away from each other, and the middle spring adds to the restoring force.

The slow direction (1, −1) is the direction in which the bound
hᵀKh ≥ ‖h‖² from §1 is an equality. So the constant C = 1
from §2, multiplied by k, is the restoring stiffness of the slow motion,
and mω₋² = Ck. The direction in which the test's lower bound is
weakest is the direction in which the system oscillates most slowly.

Any initial displacement and velocity can be resolved along these two
directions. If only the left mass is displaced, by d, and both masses are
released from rest, then (d, 0) = (d/2)(1, −1) + (d/2)(1, 1), and the
mass that started at its reference position moves as

x₁(t) = (d/2)(cos(ω₊t) − cos(ω₋t)).

The two terms cancel at release and then drift apart because their
frequencies differ.

With unequal positive masses the same potential has the same equilibrium
and a different frequency problem. For a diagonal mass matrix M, the mode
equation is kKv = ω²Mv. Because the frequencies depend on M, the
potential on its own determines the equilibrium but no oscillation
frequency.

For the undamped model, taking the dot product of the equation of motion
with ẋ shows that ½m‖ẋ‖² + kU(x) is constant.
This energy bounds ½m‖ẋ‖² + ½k‖x‖²
from above, so small initial displacements **and** velocities stay small.
The ideal equations extend to all of ℝ². The physical model
applies while the masses stay between their walls in their original order
and the springs obey Hooke's law.

## Sources and review

- Bjørn Kjos-Hanssen, [Coupled spring potential][physlib-u] and
  [Second-derivative test][physlib-test], PhyslibAlpha at commit `be0a9ee`.
- Matthew D. Schwartz, [Oscillators to Waves][schwartz], Harvard
  Physics 15c, §1. See also MIT OpenCourseWare,
  [Coupled Oscillators, Normal Modes][mit], for the superposition of modes.
- Schematic adapted from Jim.belk’s [Coupled Harmonic Oscillator k][figure],
  with inward displacement arrows and equal-stiffness labels.
  [CC BY-SA 3.0][figure-license].
- [Comparator receipt][comparator] for the original local-minimum theorem.
  Comparator accepted the Physlib proof against a challenge importing only
  Mathlib and rejected a control that asked for a local maximum.

AI agents wrote this companion under Will Cook’s direction. Lean checked
the two original modules and the supplementary proofs. Regression tests
check selected formulas against exact arithmetic and require matching
text in the Markdown. The prose, the passage links and the mechanical
interpretation await independent expert review.

[physlib-u]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean
[physlib-test]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean
[schwartz]: https://schwartz.scholars.harvard.edu/sites/g/files/omnuum7046/files/schwartz/files/lecture4-oscillators-to-waves.pdf
[mit]: https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/pages/part-i-mechanical-vibrations-and-waves/lecture-4/
[figure]: https://commons.wikimedia.org/w/index.php?title=File:Coupled_Harmonic_Oscillator_k.svg&oldid=870225002
[figure-license]: https://creativecommons.org/licenses/by-sa/3.0/
[comparator]: https://github.com/wcook04/proof-reader/tree/f5f5e6f81251f766b0a705d46960e47e8b8a8962/papers/coupled-spring/comparator

## Statements and comparisons

The statements on this page that were compared with a Lean declaration, and the Lean statements written for this page. The comparisons were made by AI and have not been reviewed.

| Statement on this page | Lean | Comparison with the page |
| --- | --- | --- |
| The coupled spring potential equals `(x₀ + x₁/2)² + (3/4) x₁²` at every point | [`couplingPotential_eq_sq_add_sq`][couplingPotential_eq_sq_add_sq] | Written by AI for this page; not in Physlib |
| Local minimum at the origin | [`coupled_spring_potential`][coupled_spring_potential] | Same statement |
| Analytic second derivative test | [`second_derivative_test_analyticAt`][second_derivative_test_analyticAt] | Same statement |
| The potential is analytic | [`couplingPotential_analyticAt`][couplingPotential_analyticAt] | Same statement |
| Derivative of the potential | [`couplingPotential_hasFDerivAt`][couplingPotential_hasFDerivAt] | Same statement |
| Zero gradient at the origin | [`couplingPotential_gradient_zero`][couplingPotential_gradient_zero] | Same statement |
| Second derivative of the potential | [`couplingPotential_iteratedFDeriv_two`][couplingPotential_iteratedFDeriv_two] | Same statement |
| Positive Hessian at the origin | [`couplingPotential_posDef`][couplingPotential_posDef] | Same statement |
| Adding `x₀³` keeps a local minimum at the origin. The proof applies the analytic second-derivative test from PhyslibAlpha, the test that proves the original theorem | [`cubicPerturbation_isLocalMin`][cubicPerturbation_isLocalMin] | Written by AI for this page; not in Physlib |
| The cubic `x₀³` has zero second derivative at the origin | [`cube_iteratedFDeriv_two_zero`][cube_iteratedFDeriv_two_zero] | Written by AI for this page; not in Physlib |
| Near the origin the minimum is strict: if `|x₀| < 1/4` and `x ≠ 0`, the perturbed potential is positive, because it is at least `(x₁ + x₀/2)² + x₀²/2` | [`cubicPerturbation_strict_near_origin`][cubicPerturbation_strict_near_origin] | Written by AI for this page; not in Physlib |
| The origin is not a global minimum after adding `x₀³`: the value at `(-2, 0)` is `-4` | [`cubicPerturbation_not_global`][cubicPerturbation_not_global] | Written by AI for this page; not in Physlib |
| Minimum from the Taylor remainder | [`isLocalMin_of_posDef_of_littleo`][isLocalMin_of_posDef_of_littleo] | Lean is weaker |
| Polar form of the Hessian | [`polarBilin_iteratedFDerivQuadraticMap`][polarBilin_iteratedFDerivQuadraticMap] | Same statement |
| The little-o form of the second-derivative test holds without the smoothness hypothesis: the proof of `isLocalMin_of_posDef_of_littleo` with its use of that hypothesis removed | [`isLocalMin_of_posDef_of_littleo_without_smoothness`][isLocalMin_of_posDef_of_littleo_without_smoothness] | Written by AI for this page; not in Physlib |
| At every point other than the origin the coupled spring potential is larger than at the origin | [`couplingPotential_origin_lt`][couplingPotential_origin_lt] | Written by AI for this page; not in Physlib |
| Away from the origin the coupled spring potential is strictly positive | [`couplingPotential_pos`][couplingPotential_pos] | Written by AI for this page; not in Physlib |

[couplingPotential]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L56-L57
[couplingPotential_eq_sq_add_sq]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/GlobalMinimum.lean#L3-L7
[coupled_spring_potential]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L153-L160
[second_derivative_test_analyticAt]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L600-L606
[couplingPotential_analyticAt]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L68-L75
[couplingPotential_hasFDerivAt]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L81-L92
[couplingPotential_gradient_zero]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L97-L101
[couplingPotential_iteratedFDeriv_two]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L106-L130
[couplingPotential_posDef]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean#L142-L151
[iteratedFDerivQuadraticMap]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L107-L126
[coercive_of_posdef]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L455-L505
[isLocalMin.of_subsingleton]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L571-L573
[littleO_of_powerseries]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L558-L568
[le_of_littleO]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L514-L530
[cubicPerturbation_isLocalMin]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/CubicPerturbation.lean#L66-L71
[cube_iteratedFDeriv_two_zero]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/CubicPerturbation.lean#L8-L15
[cubicPerturbation_strict_near_origin]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/CubicPerturbation.lean#L73-L109
[cubicPerturbation_not_global]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/CubicPerturbation.lean#L111-L116
[isLocalMin_of_posDef_of_littleo]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L534-L554
[coercive_of_posdef_of_contdiff]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L432-L452
[polarBilin_iteratedFDerivQuadraticMap]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L402-L410
[iteratedFDeriv_two_swap]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L415-L425
[isLocalMin_of_posDef_of_littleo_without_smoothness]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/WithoutSmoothness.lean#L5-L26
[second_derivative_test]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean#L576-L594
[couplingPotential_origin_lt]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/GlobalMinimum.lean#L48-L53
[couplingPotential_pos]: https://github.com/wcook04/proof-reader/blob/31e15e8d604c9feb9c17594cc57fad3d2f95e0af/papers/coupled-spring/checks/GlobalMinimum.lean#L22-L46
