import EditionStatements
import SectionAnalysisDefinitions

/-!
# Exact propositions left open by this return

An open target is a proposition definition, not a proved assertion. The
reason for leaving each target open is stated at its definition. In
particular, absence of a bridge here is not a finding that the underlying
mathematical claim is false or that the authors' whole library lacks it.
-/

open MeasureTheory Set Filter
open scoped ContDiff ENNReal Topology
noncomputable section
namespace NavierStokes

/-- The quantitative torus part of Theorem 1.1, for the explicit formal profile
class. It requires one smooth periodic solution and periodic pressure before
its blow-up time, the two-sided H¹ rate, and the H¹ error on B_(1/16).
The supplied mild-trajectory and norm results do not by themselves construct
that smooth physical solution; the periodic mild-to-smooth regularity bridge
and its assembly with these estimates remain to be supplied. -/
def theorem_1_1_torus : Prop := Theorem11.Theorem11Torus

/-- Derive the Hessian decay from the printed smooth recurrent profile
hypotheses. Remark 1.2 states the relevant interior-estimate argument, but
that derivation is not proved by this return. It is separate from the
pressure-gradient estimate. -/
def hessian_decay_from_printed_profile : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Theorem11.Space ≃ₗᵢ[ℝ] Theorem11.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ B : ℝ, ∀ s y, ‖iteratedFDeriv ℝ 2 (W s) y‖ ≤ B / (1 + ‖y‖) ^ 3

/-- Derive pressure-gradient decay from the printed profile class. The
paper's Remark 1.2 does not state this estimate. It is an explicit assumption
of the formal profile route and remains an unproved analytic bridge here. -/
def pressure_gradient_decay_from_printed_profile : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Theorem11.Space ≃ₗᵢ[ℝ] Theorem11.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ B : ℝ, PressureGradientDecay q B

/-- The whole-space statement (1.6) under the printed profile assumptions.
The physical error change of variables is proved in SpatialScaling. The
remaining task is to derive the second-derivative and pressure-gradient
bounds and assemble one common decay constant. -/
def theorem_1_1_printed_space : Prop := Theorem11.PaperTheorem11Space

/-- The quantitative torus statement (1.7) under the printed profile
assumptions. This needs the decay upgrades and the periodic regularity and
quantitative assembly described at theorem_1_1_torus. -/
def theorem_1_1_printed_torus : Prop := Theorem11.PaperTheorem11Torus

end NavierStokes

/- Import SectionAnalysisDefinitions before inserting this fragment. -/
open MeasureTheory Set Real
open scoped ENNReal ContDiff

noncomputable section

namespace NavierStokes

/-- Proposition 2.1, with the paper's prescribed-datum quantifier. One fixed
finite-dimensional space E corrects every sufficiently close datum; both rate
constants and the exponent are uniform over those data. This remains open in
this layer: `proposition_2_1_available` chooses a close datum instead of
correcting every supplied datum. The profile is the printed profile class,
so the derivative and pressure-decay upgrade is also needed. -/
def proposition_2_1_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ (κ c C ε₀ : ℝ) (E : Submodule ℝ Breakdown.Freq.X),
      0 < κ ∧ κ < (1 / 4 : ℝ) ∧ 0 < c ∧ c ≤ C ∧ 0 < ε₀ ∧
      FiniteDimensional ℝ E ∧ E ≤ Breakdown.Freq.testSpan ∧
      (∀ w₀ : Breakdown.Freq.X, ‖w₀ - Breakdown.Freq.embedX (W 0)‖ ≤ ε₀ →
        ∃ γ : E, ∃ u : ℝ → Breakdown.Freq.X,
          u 0 = w₀ + γ ∧ Breakdown.Freq.realization.F.IsMildOn u 0 1 ∧
          ∀ t ∈ Ico (0 : ℝ) 1,
            c * (1 - t) ^ (-(1 / 4 : ℝ)) ≤ ‖u t‖ ∧
            ‖u t‖ ≤ C * (1 - t) ^ (-(1 / 4 : ℝ)) ∧
            ‖u t - Analysis.profileCurve W t‖ ≤ C * (1 - t) ^ (κ - (1 / 4 : ℝ))) ∧
      ∃ φ : Breakdown.Space → Breakdown.Space, Breakdown.IsTestField φ ∧
        ‖Breakdown.Freq.embedX φ - Breakdown.Freq.embedX (W 0)‖ ≤ ε₀

/-- Proposition 2.2 as a periodic mild trajectory, with a smooth mean-zero
initial datum, T≤1, the two-sided H¹ rate, and the local H¹ profile error.
Weak Fourier derivatives define the error; no derivative of an arbitrary
representative is silently assumed. The local error is explicitly integrable.
Open: the supplied periodic trajectory theorem retains unboundedness, while
assembling these rates and this error estimate remains to be proved. -/
def proposition_2_2_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ (T κ c C : ℝ) (u₀ : Breakdown.Space → Breakdown.Space)
      (u : ℝ → Breakdown.Periodic.V),
      0 < T ∧ T ≤ 1 ∧ 0 < κ ∧ κ < (1 / 4 : ℝ) ∧ 0 < c ∧ c ≤ C ∧
      ContDiff ℝ ∞ u₀ ∧ Breakdown.Periodic.IsPeriodic u₀ ∧
      (∀ x, Breakdown.divergenceAt u₀ x = 0) ∧
      (∫ x in Breakdown.Periodic.cell, u₀ x) = 0 ∧
      u 0 = Breakdown.Periodic.toV u₀ ∧ Breakdown.Periodic.IsMildOn u 0 T ∧
      ∀ t ∈ Ico (0 : ℝ) T,
        Breakdown.Periodic.coeff (u t) 0 = 0 ∧
        c * (T - t) ^ (-(1 / 4 : ℝ)) ≤ ‖u t‖ ∧
        ‖u t‖ ≤ C * (T - t) ^ (-(1 / 4 : ℝ)) ∧
        Integrable (Analysis.torusErrorSquare (u t) (Theorem11.comparisonField W T t))
          (volume.restrict (Metric.ball 0 (1 / 16 : ℝ))) ∧
        Analysis.torusErrorNorm (u t) (Theorem11.comparisonField W T t)
          (Metric.ball 0 (1 / 16 : ℝ)) ≤ C * (T - t) ^ (κ - (1 / 4 : ℝ))

/-- Lemma 2.3 in both domains. The whole-space conclusion includes energy
nonincrease and one smooth representative on the entire half-open interval.
The periodic conclusion gives smooth periodic velocity and pressure. Open in
this combined form: the whole-space gluing and energy results are available
in the supplied Theorem11 wrappers, but periodic mild-to-smooth regularity is
still required. -/
def lemma_2_3_target : Prop :=
  (∀ (φ : Breakdown.Space → Breakdown.Space) (u : ℝ → Breakdown.Freq.X)
    (T : ℝ), Breakdown.IsTestField φ → 0 < T →
    Breakdown.Freq.realization.F.IsMildOn u 0 T →
    u 0 = Breakdown.Freq.realization.embed φ →
    ∃ (U : Theorem11.Velocity) (p : Theorem11.Pressure),
      Theorem11.IsSmoothSolutionBefore 1 T φ U p ∧
      (∀ t ∈ Ico (0 : ℝ) T,
        (Breakdown.Freq.velocity (u t) : Breakdown.Space → Breakdown.Space) =ᵐ[volume] U t) ∧
      ∀ t ∈ Ico (0 : ℝ) T,
        ∫⁻ x, ENNReal.ofReal (‖U t x‖ ^ 2) ≤
          ∫⁻ x, ENNReal.ofReal (‖φ x‖ ^ 2)) ∧
  (∀ (φ : Breakdown.Space → Breakdown.Space) (u : ℝ → Breakdown.Periodic.V)
    (T : ℝ), ContDiff ℝ ∞ φ → Breakdown.Periodic.IsPeriodic φ →
    (∀ x, Breakdown.divergenceAt φ x = 0) →
    (∫ x in Breakdown.Periodic.cell, φ x) = 0 →
    0 < T → Breakdown.Periodic.IsMildOn u 0 T → u 0 = Breakdown.Periodic.toV φ →
    ∃ (U : Theorem11.Velocity) (p : Theorem11.Pressure),
      Theorem11.IsSmoothSolutionBefore 1 T φ U p ∧
      ∀ t ∈ Ico (0 : ℝ) T,
        Theorem11.PeriodicField (U t) ∧ Theorem11.PeriodicScalar (p t) ∧
        Breakdown.Periodic.toV (U t) = u t)

/-- Lemma 3.1, including the arbitrary L^(3/2) force. The operator is specified
by its pairing against every homogeneous H¹ vector through the authors'
projected heat test field `phiX`; this fixes e^(τΔ)P without choosing pointwise
representatives. The bilinear bounds are stated as well. Open: the returned
proof establishes the bilinear part, not this whole linear extension. -/
def lemma_3_1_target : Prop :=
  ∃ A : ℝ → Lp (α := Breakdown.Space) Breakdown.Space (3 / 2) →L[ℝ] Breakdown.Freq.X,
    ∃ C : ℝ, 0 ≤ C ∧
      (∀ τ, 0 < τ → ∀ f : Lp (α := Breakdown.Space) Breakdown.Space (3 / 2),
        ‖A τ f‖ ≤ C * τ ^ (-(3 / 4 : ℝ)) * ‖f‖ ∧
        ∀ ψ : Breakdown.Freq.X,
          Integrable (fun x => inner ℝ (f x) (Breakdown.Freq.phiX τ ψ x)) ∧
          inner ℝ (A τ f) ψ = ∫ x, inner ℝ (f x) (Breakdown.Freq.phiX τ ψ x)) ∧
      (∀ s τ, 0 ≤ s → 0 < τ → ∀ f,
        Breakdown.Freq.heatX s (A τ f) = A (s + τ) f) ∧
      (∀ f, ContinuousOn (fun τ => A τ f) (Ioi 0)) ∧
      ∃ CK : ℝ, 0 ≤ CK ∧ ∀ τ, 0 < τ → ∀ u v : Breakdown.Freq.X,
        ‖Breakdown.Freq.bilinX τ u v‖ ≤ CK * τ ^ (-(3 / 4 : ℝ)) * ‖u‖ * ‖v‖

/-- Lemma 3.4 on every finite interval. The bounded linear map U solves the
Volterra equation for each continuous source; the last clause gives uniqueness.
There is no operator-norm smallness hypothesis. Open: the package's local
Neumann inverse and short-step arguments must be assembled into this exact
whole-interval solution operator. -/
def lemma_3_4_target : Prop :=
  ∀ (X : Type) [NormedAddCommGroup X] [NormedSpace ℝ X] [CompleteSpace X]
    (H : Breakdown.HeatBilinear X) (a b : ℝ) (f : ℝ → X),
    a ≤ b → ContinuousOn f (Icc a b) →
    ∃ U : C(Icc a b, X) →L[ℝ] C(Icc a b, X),
      (∀ g : C(Icc a b, X), ∀ t : Icc a b,
        U g t = (2 : ℝ) • (∫ s in a..t,
          H.K (t - s) (f s) (Analysis.intervalExtension (U g) s)) + g t) ∧
      ∀ g h : C(Icc a b, X),
        (∀ t : Icc a b, h t = (2 : ℝ) • (∫ s in a..t,
          H.K (t - s) (f s) (Analysis.intervalExtension h s)) + g t) → h = U g

/-- Lemma 3.6 for a continuous homogeneous H¹ curve, with only the weak
equation against compactly supported smooth solenoidal test fields. The
closed-interval derivative uses the one-sided derivative at its endpoints.
Open: the existing weak-to-mild theorem additionally assumes pointwise decay
of its physical slices and L² continuity of differences. -/
def lemma_3_6_target : Prop :=
  ∀ (u : ℝ → Breakdown.Freq.X) (a b : ℝ), a < b → ContinuousOn u (Icc a b) →
    (∀ ψ : Breakdown.Space → Breakdown.Space, Breakdown.IsTestField ψ →
      ContDiffOn ℝ 1 (fun t => ∫ x,
        inner ℝ (Breakdown.Freq.velocity (u t) x) (ψ x)) (Icc a b) ∧
      ∀ t ∈ Icc a b,
        HasDerivWithinAt (fun τ => ∫ x,
          inner ℝ (Breakdown.Freq.velocity (u τ) x) (ψ x))
          (∫ x, inner ℝ (Breakdown.Freq.velocity (u t) x)
              (Breakdown.sumSecondPartialsAt ψ x) +
            ∑ i : Fin 3, (Breakdown.Freq.velocity (u t) x) i *
              inner ℝ (Breakdown.Freq.velocity (u t) x)
                (fderiv ℝ ψ x (Breakdown.unitVector i))) (Icc a b) t) →
    Breakdown.Freq.IsMildX u a b

/-- Lemma 3.7's period-independent projected-heat and bilinear estimates.
Fourier coefficients specify the projected heat field; the mean-zero
condition is explicit. The assertion is open beyond the unit-period,
short-time inhomogeneous estimate proved in `lemma_3_7_available`. -/
def lemma_3_7_target : Prop :=
  ∃ (C CT : ℝ), 0 ≤ C ∧ 0 ≤ CT ∧
    ∀ L : ℝ, 0 < L →
      (∀ f : Breakdown.Space → Breakdown.Space,
        Analysis.PeriodicAt L f → MemLp f (3 / 2) (volume.restrict (Analysis.cube L)) →
        (∫ x in Analysis.cube L, f x) = 0 →
        ∃ u : ℝ → Breakdown.Periodic.V,
          ContinuousOn u (Ioi 0) ∧
          (∀ τ, 0 < τ →
            (∀ k : Breakdown.Periodic.Lattice,
              Breakdown.Periodic.coeff (u τ) k =
                Real.exp (-(4 * Real.pi ^ 2 * τ * ‖Breakdown.Periodic.freq k‖ ^ 2 / L ^ 2)) •
                  Breakdown.Periodic.divFree k (Analysis.torusCoefficient L f k)) ∧
            Analysis.torusGradientNorm L (u τ) ≤ C * τ ^ (-(3 / 4 : ℝ)) *
              (eLpNorm f (3 / 2) (volume.restrict (Analysis.cube L))).toReal) ∧
          ∀ s τ, 0 ≤ s → 0 < τ →
            Breakdown.Periodic.heat (s / L ^ 2) (u τ) = u (s + τ)) ∧
      ∀ τ, 0 < τ → ∀ u v : Breakdown.Periodic.V,
        Breakdown.Periodic.coeff u 0 = 0 → Breakdown.Periodic.coeff v 0 = 0 →
        MemLp (Analysis.torusConvection L u v) (3 / 2) (volume.restrict (Analysis.cube L)) ∧
        (∫ x in Analysis.cube L, Analysis.torusConvection L u v x) = 0 ∧
        Breakdown.Periodic.coeff (Analysis.torusKernel L τ u v) 0 = 0 ∧
        Analysis.torusGradientNorm L (Analysis.torusKernel L τ u v) ≤
          CT * τ ^ (-(3 / 4 : ℝ)) * Analysis.torusGradientNorm L u * Analysis.torusGradientNorm L v

/-- Proposition 4.1 with the printed profile hypothesis and its exact
recurrence. Open: retain the prescribed profile while proving the passage to
the homogeneous H¹ realization and the recurrence from that printed class.
`proposition_4_1_available` proves the Duhamel change of variables once the
abstract orbit has already been established. -/
def proposition_4_1_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    Breakdown.Freq.realization.F.IsMildOn (Analysis.profileCurve W) 0 1 ∧
    (∃ t ∈ Ico (0 : ℝ) 1, Analysis.profileCurve W t ≠ 0) ∧
    ∀ t ∈ Ico (0 : ℝ) 1,
      Analysis.profileCurve W (1 - Real.exp (-S) * (1 - t)) =
        Breakdown.Freq.rotX R (Breakdown.Freq.dilX (Real.exp (-S))⁻¹
          (Analysis.profileCurve W t))

/-- Lemma 4.2 with the iterated recurrence (4.3) and the physical two-sided
rate (4.4). Open in this literal form; the available theorem supplies the
positive lower and upper bounds for the recurrent similarity orbit. -/
def lemma_4_2_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    (∀ n : ℕ, ∀ σ ∈ Ico (0 : ℝ) 1,
      Analysis.profileCurve W (1 - Real.exp (-S) ^ n + Real.exp (-S) ^ n * σ) =
        ((Breakdown.Freq.rotX R : Breakdown.Freq.X → Breakdown.Freq.X)^[n])
          (Breakdown.Freq.dilX (Real.exp (-S) ^ n)⁻¹ (Analysis.profileCurve W σ))) ∧
    ∃ c C : ℝ, 0 < c ∧ c ≤ C ∧ ∀ t ∈ Ico (0 : ℝ) 1,
      c * (1 - t) ^ (-(1 / 4 : ℝ)) ≤ ‖Analysis.profileCurve W t‖ ∧
      ‖Analysis.profileCurve W t‖ ≤ C * (1 - t) ^ (-(1 / 4 : ℝ))

/-- Proposition 4.3: a bounded linear right inverse on the single weighted
trajectory space, with corrections in one fixed finite-dimensional space of
test fields. Open: transfer the authors' bounded inverse on sequences of
short pieces to this trajectory norm, with its quantifiers and datum map. -/
def proposition_4_3_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ (κ CR : ℝ) (E : Submodule ℝ Breakdown.Freq.X)
      (inv : (ℝ → Breakdown.Freq.X) → Breakdown.Freq.X × (ℝ → Breakdown.Freq.X)),
      0 < κ ∧ κ < (1 / 4 : ℝ) ∧ FiniteDimensional ℝ E ∧ E ≤ Breakdown.Freq.testSpan ∧
      Analysis.WeightedLinear κ inv ∧
      ∀ g, Analysis.WeightedCurve κ g →
        (inv g).1 ∈ E ∧ Analysis.WeightedCurve κ (inv g).2 ∧
        max ‖(inv g).1‖ (Analysis.weightedNorm κ (inv g).2) ≤ CR * Analysis.weightedNorm κ g ∧
        ∀ t ∈ Ico (0 : ℝ) 1,
          (inv g).2 t - (2 : ℝ) •
            Analysis.duhamel Breakdown.Freq.realization.F.toHeatBilinear
              (Analysis.profileCurve W) (inv g).2 t -
                Breakdown.Freq.heatX t (inv g).1 = g t

/-- Lemma 4.4 for the one-period monodromy of the paper. The first conjunct
makes the Volterra inverse well defined; the remaining conjuncts give
compactness of its difference from the free evolution and the free norm
bound. Open: identify this operator with the short-step product used by the
authors' proved monodromy theorem. -/
def lemma_4_4_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    let lam := Real.exp (-S)
    let F := Breakdown.Freq.realization.F
    let ρ := Breakdown.Freq.rotX R
    let u := Analysis.profileCurve W
    let free := (ρ.symm.toContinuousLinearEquiv : Breakdown.Freq.X →L[ℝ] Breakdown.Freq.X).comp
      ((F.D lam).comp (F.G (1 - lam)))
    IsUnit (1 - (2 : ℝ) • F.toHeatBilinear.pieceBil (1 - lam)
      (Breakdown.toPiece (1 - lam) u)) ∧
    IsCompactOperator (Analysis.monodromy F ρ u lam - free) ∧ ‖free‖ ≤ lam ^ (1 / 4 : ℝ)

/-- Lemma 4.6: normalization of the forced equation gives the recurrence
χ_(n+1)=Mχ_n+f_n and a forcing bound uniform in n, g and χ. The forcing is
defined from g alone. Open: the continuous-time source must be transported to
the exact short-piece recursion, retaining this norm bound. -/
def lemma_4_6_target : Prop :=
  ∀ (X : Type) [NormedAddCommGroup X] [InnerProductSpace ℝ X] [CompleteSpace X]
    (F : Breakdown.MildFramework X) (ρ : X ≃ₗᵢ[ℝ] X) (w : ℝ → X) (S κ : ℝ),
    F.Commutes ρ → F.IsOrbit ρ w S → 0 < κ → κ < (1 / 4 : ℝ) →
    let lam := Real.exp (-S)
    let u := F.selfSimilar w 0
    let U := Analysis.periodResolvent F.toHeatBilinear u (1 - lam)
    IsUnit (1 - (2 : ℝ) • F.toHeatBilinear.pieceBil (1 - lam)
      (Breakdown.toPiece (1 - lam) u)) ∧
    ∃ C : ℝ,
      (∀ g h : ℝ → X, Analysis.WeightedCurve κ g → Analysis.WeightedCurve κ h → ∀ n,
        Analysis.recurrenceForcing F ρ u lam (g + h) n =
          Analysis.recurrenceForcing F ρ u lam g n + Analysis.recurrenceForcing F ρ u lam h n) ∧
      (∀ c : ℝ, ∀ g : ℝ → X, Analysis.WeightedCurve κ g → ∀ n,
        Analysis.recurrenceForcing F ρ u lam (c • g) n =
          c • Analysis.recurrenceForcing F ρ u lam g n) ∧
      ∀ (g v : ℝ → X) (χ : X), Analysis.WeightedCurve κ g →
      ContinuousOn v (Ico 0 1) →
      (∀ t ∈ Ico (0 : ℝ) 1,
        v t = F.G t χ + (2 : ℝ) • Analysis.duhamel F.toHeatBilinear u v t + g t) →
      let χn := fun n => Analysis.normalizedPiece F ρ lam v n 0 -
        Analysis.normalizedPiece F ρ lam g n 0
      χn 0 = χ ∧ ∀ n : ℕ,
        (∀ s : Icc (0 : ℝ) (1 - lam),
          Analysis.normalizedPiece F ρ lam v n s =
            U (F.toHeatBilinear.pieceFree (1 - lam) (χn n)) s +
              U (Breakdown.toPiece (1 - lam) (Analysis.normalizedPiece F ρ lam g n)) s) ∧
        χn (n + 1) = Analysis.monodromy F ρ u lam (χn n) +
          Analysis.recurrenceForcing F ρ u lam g n ∧
        ‖Breakdown.toPiece (1 - lam) (Analysis.normalizedPiece F ρ lam g n)‖ +
          ‖Analysis.recurrenceForcing F ρ u lam g n‖ ≤
            C * (lam ^ κ) ^ n * Analysis.weightedNorm κ g

/-- Lemma 4.8: a bounded right inverse corrects an approximate trajectory
whose weighted residual is sufficiently small. The correction, its norm and
its initial value are all retained. Open: the authors prove the contraction
in a sequence space; that result has not been transported to this exact
weighted residual formulation. -/
def lemma_4_8_target : Prop :=
  ∀ κ CK : ℝ, 0 < κ → κ < (1 / 4 : ℝ) →
    ∃ ε₁ : ℝ, 0 < ε₁ ∧
      ∀ (X : Type) [NormedAddCommGroup X] [NormedSpace ℝ X] [CompleteSpace X]
        (H : Breakdown.HeatBilinear X), H.CK = CK →
      ∀ (E : Type) [AddCommGroup E] [Module ℝ E] (J : E →ₗ[ℝ] X)
        (ua : ℝ → X) (CR : ℝ) (inv : (ℝ → X) → E × (ℝ → X)),
        ContinuousOn ua (Ico 0 1) →
        let Fa := fun t => ua t - H.G t (ua 0) - Analysis.duhamel H ua ua t
        Analysis.WeightedCurve κ Fa → Analysis.WeightedLinear κ inv →
        (∀ g, Analysis.WeightedCurve κ g →
          Analysis.WeightedCurve κ (inv g).2 ∧
          Analysis.weightedNorm κ (inv g).2 ≤ CR * Analysis.weightedNorm κ g ∧
          ∀ t ∈ Ico (0 : ℝ) 1,
            (inv g).2 t - (2 : ℝ) • Analysis.duhamel H ua (inv g).2 t -
              H.G t (J (inv g).1) = g t) →
        ∀ χ : X,
          CR ^ 2 * Analysis.weightedNorm κ (fun t => H.G t χ - Fa t) ≤ ε₁ →
          ∃ (γ : E) (v : ℝ → X), Analysis.WeightedCurve κ v ∧
            Analysis.weightedNorm κ v ≤
              2 * CR * Analysis.weightedNorm κ (fun t => H.G t χ - Fa t) ∧
            (∀ t ∈ Ico (0 : ℝ) 1,
              v t = (2 : ℝ) • Analysis.duhamel H ua v t + Analysis.duhamel H v v t +
                H.G t (χ + J γ) - Fa t) ∧
            H.IsMildOn (ua + v) 0 1 ∧ (ua + v) 0 = ua 0 + χ + J γ

/-- Lemma 5.1 for every cutoff radius r>0, with a constant independent of r
and t. Both the H¹ error and the L² mass are finite before their norms are
used. Open: the fixed-radius estimates in the library must be transported to
this explicit cutoff and radius, together with the printed profile premises. -/
def lemma_5_1_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A : ℝ),
    Theorem11.IsPaperProfile W q S R A →
    ∃ C : ℝ, 0 ≤ C ∧ ∀ r : ℝ, 0 < r →
      ContDiffOn ℝ ∞ (fun z : ℝ × Breakdown.Space => Analysis.cutoffProfile W r z.1 z.2)
        (Ico 0 1 ×ˢ univ) ∧
      ∀ t ∈ Ico (0 : ℝ) 1,
        Breakdown.IsTestField (Analysis.cutoffProfile W r t) ∧
        (∀ x ∈ Metric.ball 0 (r / 2),
          Analysis.cutoffProfile W r t x = Theorem11.comparisonField W 1 t x) ∧
        (∀ x, r ≤ ‖x‖ → Analysis.cutoffProfile W r t x = 0) ∧
        Theorem11.FiniteGradient (Analysis.cutoffProfile W r t - Theorem11.comparisonField W 1 t) ∧
        Theorem11.gradientNorm (Analysis.cutoffProfile W r t - Theorem11.comparisonField W 1 t) ≤
          C * r ^ (-(1 / 2 : ℝ)) ∧
        MemLp (Analysis.cutoffProfile W r t) 2 volume ∧
        (eLpNorm (Analysis.cutoffProfile W r t) 2 volume).toReal ≤ C * r ^ (1 / 2 : ℝ)

/-- Lemma 6.2 with the large torus period and the weighted physical residual
kept explicitly. The chosen κ and the lower profile rate c* are parameters.
Open: the library's normalized interval bounds must be assembled into these
physical-time estimates, with the equality of homogeneous norms and the
explicit L^(-1/2) rate retained. -/
def lemma_6_2_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A κ cstar : ℝ),
    Theorem11.IsPaperProfile W q S R A → 0 < κ → κ < (1 / 4 : ℝ) → 0 < cstar →
    (∀ t ∈ Ico (0 : ℝ) 1,
      cstar * (1 - t) ^ (-(1 / 4 : ℝ)) ≤ ‖Analysis.profileCurve W t‖) →
    ∃ C : ℝ, 0 ≤ C ∧ ∀ L : ℝ, 1 ≤ L →
      ContinuousOn (Analysis.approximateTorus W L) (Ico 0 1) ∧
      (∀ t ∈ Ico (0 : ℝ) 1,
        Theorem11.FiniteGradient (Analysis.cutoffProfile W (L / 8) t) ∧
        IntervalIntegrable (fun s => Analysis.torusKernel L (t - s)
          (Analysis.approximateTorus W L s) (Analysis.approximateTorus W L s)) volume 0 t ∧
        (cstar - C * L ^ (-(1 / 2 : ℝ))) * (1 - t) ^ (-(1 / 4 : ℝ)) ≤
          Analysis.torusGradientNorm L (Analysis.approximateTorus W L t) ∧
        Analysis.torusGradientNorm L (Analysis.approximateTorus W L t) =
          Theorem11.gradientNorm (Analysis.cutoffProfile W (L / 8) t) ∧
        Analysis.torusGradientNorm L (Analysis.approximateTorus W L t) ≤
          C * (1 - t) ^ (-(1 / 4 : ℝ))) ∧
      Analysis.TorusWeighted κ L (Analysis.approximateTorusResidual W L) ∧
      Analysis.torusWeightedNorm κ L (Analysis.approximateTorusResidual W L) ≤
        C * L ^ (-(1 / 2 : ℝ))

/-- Lemma 6.1 with its complete quantifiers: every L≥1, every t>0 and every
compactly supported W^(1,1) tensor, with a constant independent of L and t.
Weak tensor derivatives define div F, and Fourier formulas define both heat
fields. The conclusion explicitly requires the finiteness of both norms.
Open: the authors' local comparison is uniform only away from the singular
lag and gives an unspecified threshold, not this L^(-7/2) estimate. -/
def lemma_6_1_target : Prop :=
  ∃ C : ℝ, 0 ≤ C ∧ ∀ (L t : ℝ) (F : Breakdown.Space → Analysis.Tensor)
    (DF : Fin 3 → Breakdown.Space → Analysis.Tensor),
    1 ≤ L → 0 < t → Analysis.TensorW11 F DF →
    (∀ᵐ x ∂volume, x ∉ Metric.closedBall 0 (L / 8) → F x = 0) →
    let force := Analysis.tensorDivergence DF
    let g := fun x => Analysis.periodicHeatField L t (Analysis.periodize L force) x -
      Analysis.projectedHeatField t force x
    ContDiff ℝ ∞ g ∧
    Integrable (Theorem11.gradientSquare g) (volume.restrict (Analysis.cube L)) ∧
    MemLp g 6 (volume.restrict (Analysis.cube L)) ∧
    Real.sqrt (∫ x in Analysis.cube L, Theorem11.gradientSquare g x) +
      (eLpNorm g 6 (volume.restrict (Analysis.cube L))).toReal ≤
        C * L ^ (-(7 / 2 : ℝ)) * ∫ x, Analysis.tensorNorm (F x)

/-- Lemma 6.3 for the candidate (6.12). The supplied whole-space right inverse
is the one in Proposition 4.3; each correction has a specified smooth test
field representative supported in B_(rE). The candidate is defined by
(γ,v)=R A(g|B) and z=g+A_T((g+v)|B)+heat(Π_L γ). The conclusion keeps linearity,
the uniform bound and the explicit L^(-1/2) defect.

Open: identify the localized interaction operators with these physical fields,
prove their period-uniform comparison, and transfer the authors' inverse
construction to this particular approximate inverse. Existence and finiteness
of the projected-heat integrals are included in the conclusion, so their
conditional definitions cannot silently make the estimate vacuous. -/
def lemma_6_3_target : Prop :=
  ∀ (W : Theorem11.Velocity) (q : Theorem11.Pressure) (S : ℝ)
    (R : Breakdown.Space ≃ₗᵢ[ℝ] Breakdown.Space) (A κ rE CR : ℝ)
    (E : Submodule ℝ Breakdown.Freq.X)
    (datum : E →ₗ[ℝ] (Breakdown.Space → Breakdown.Space))
    (inv : (ℝ → Breakdown.Freq.X) → E × (ℝ → Breakdown.Freq.X)),
    Theorem11.IsPaperProfile W q S R A → 0 < κ → κ < (1 / 4 : ℝ) → 0 < rE →
    FiniteDimensional ℝ E →
    (∀ e : E, Breakdown.IsTestField (datum e) ∧
      tsupport (datum e) ⊆ Metric.closedBall 0 rE ∧ Breakdown.Freq.embedX (datum e) = e) →
    Analysis.WeightedLinear κ inv →
    (∀ f, Analysis.WeightedCurve κ f →
      Analysis.WeightedCurve κ (inv f).2 ∧
      max ‖((inv f).1 : Breakdown.Freq.X)‖ (Analysis.weightedNorm κ (inv f).2) ≤
        CR * Analysis.weightedNorm κ f ∧
      ∀ t ∈ Ico (0 : ℝ) 1,
        (inv f).2 t - (2 : ℝ) • Analysis.duhamel Breakdown.Freq.realization.F.toHeatBilinear
          (Analysis.profileCurve W) (inv f).2 t - Breakdown.Freq.heatX t (inv f).1 = f t) →
    ∃ C : ℝ, 0 ≤ C ∧ ∀ L : ℝ, max 1 (8 * rE) ≤ L →
      let candidate := fun g : ℝ → Breakdown.Periodic.V =>
        let pair := inv (Analysis.wholeInteraction W L g 0)
        (pair.1, fun t => g t + Analysis.periodicInteraction W L g pair.2 t +
          Breakdown.Periodic.heat (t / L ^ 2)
            (Analysis.toTorus L (Analysis.periodize L (datum pair.1))))
      Analysis.TorusWeightedLinear κ L candidate ∧
      ∀ g : ℝ → Breakdown.Periodic.V, Analysis.TorusWeighted κ L g →
        Analysis.InteractionsDefined W L g 0 ∧
        Analysis.WeightedCurve κ (Analysis.wholeInteraction W L g 0) ∧
        Analysis.InteractionsDefined W L g (inv (Analysis.wholeInteraction W L g 0)).2 ∧
        Analysis.TorusWeighted κ L (candidate g).2 ∧
        max ‖((candidate g).1 : Breakdown.Freq.X)‖
          (Analysis.torusWeightedNorm κ L (candidate g).2) ≤ C * Analysis.torusWeightedNorm κ L g ∧
        Analysis.TorusWeighted κ L (fun t =>
          (candidate g).2 t -
            (2 : ℝ) • (∫ s in (0 : ℝ)..t, Analysis.torusKernel L (t - s)
              (Analysis.approximateTorus W L s) ((candidate g).2 s)) -
            Breakdown.Periodic.heat (t / L ^ 2)
              (Analysis.toTorus L (Analysis.periodize L (datum (candidate g).1))) - g t) ∧
        Analysis.torusWeightedNorm κ L (fun t =>
          (candidate g).2 t -
            (2 : ℝ) • (∫ s in (0 : ℝ)..t, Analysis.torusKernel L (t - s)
              (Analysis.approximateTorus W L s) ((candidate g).2 s)) -
            Breakdown.Periodic.heat (t / L ^ 2)
              (Analysis.toTorus L (Analysis.periodize L (datum (candidate g).1))) - g t) ≤
          C * L ^ (-(1 / 2 : ℝ)) * Analysis.torusWeightedNorm κ L g

end NavierStokes


namespace NavierStokes
open Breakdown Breakdown.Cert Breakdown.Freq

/- These definitions are to be inserted inside namespace NavierStokes in OpenTargets.lean.
   Imports required: SectionSeven. Open namespaces: Breakdown Breakdown.Cert Breakdown.Freq.
   They state missing comparisons, and are not theorems. -/

/-- Open bridge for Lemma 7.4 and Proposition 7.5: every physical admissible
perturbation solving the free equation with invariant forcing must represent the
constructed free inverse. The proved statements construct a perturbation from
forcing; the converse for arbitrary physical perturbations is not supplied here. -/
def free_inverse_represents_every_perturbation : Prop :=
  ∀ (Γ : Set Breakdown.Symmetry) (P : ℝ), 0 < P →
    ∀ f ∈ Breakdown.Cert.invariantHH Γ,
    ∀ (v : Breakdown.Cert.VelField) (G : Breakdown.Cert.GradField)
      (H : Breakdown.Cert.SecondField) (g : Breakdown.Cert.VelField),
    Breakdown.IsPerturbation Γ P v G H g →
    (∀ φ, Breakdown.IsSpaceTimeTestField φ →
      (∫ z : ℝ × Breakdown.Space,
        (inner ℝ (g z.1 z.2) (φ z.1 z.2)
          + Breakdown.matInner (G z.1 z.2) (fderiv ℝ (φ z.1) z.2))) =
        inner ℝ f (Breakdown.Cert.testInHH φ)) →
    Breakdown.Cert.IsReadingOf (Breakdown.Cert.freeInv P f) v G H

/-- Open comparison for Proposition 7.5: weak convergence of bounded forcing
and convergence of positive periods imply local L2 convergence of the whole
sequence of velocity representatives. The supplied reduction separately gives
weak graph convergence and locally Cauchy subsequences; their identification
with this specified full-sequence limit is not proved in this return. -/
def free_inverse_local_strong_limit : Prop :=
  ∀ (P : ℕ → ℝ) (P₀ : ℝ) (f : ℕ → Breakdown.Cert.HH) (f₀ : Breakdown.Cert.HH),
    0 < P₀ → (∀ n, 0 < P n) → Filter.Tendsto P Filter.atTop (𝓝 P₀) →
    (∃ C, ∀ n, ‖f n‖ ≤ C) →
    (∀ y : Breakdown.Cert.HH, Filter.Tendsto (fun n => inner ℝ (f n) y)
      Filter.atTop (𝓝 (inner ℝ f₀ y))) →
    ∀ R > 0, Filter.Tendsto (fun n => Breakdown.periodBallNorm R
      (fun θ y => (Breakdown.Cert.readingOf (Breakdown.Cert.freeInv (P n) (f n))).1 θ y
        - (Breakdown.Cert.readingOf (Breakdown.Cert.freeInv P₀ f₀)).1 θ y))
      Filter.atTop (𝓝 0)

/-- Open regularity bridge for Proposition 7.11: starting with the displayed weak
profile identities, the uniform L6 and gradient bounds and a continuous Sobolev
representative, construct a square-integrable weak Hessian over one period.
The proved regularization theorem uses this Hessian through IsSigmaProfile;
it does not derive it from this smaller premise. -/
def weak_profile_has_period_hessian : Prop :=
  ∀ (P C : ℝ) (V : Breakdown.Cert.VelField) (G : Breakdown.Cert.GradField),
    0 < P →
    MeasureTheory.AEStronglyMeasurable (fun z : ℝ × Breakdown.Space => V z.1 z.2) MeasureTheory.volume →
    MeasureTheory.AEStronglyMeasurable (fun z : ℝ × Breakdown.Space => G z.1 z.2) MeasureTheory.volume →
    (∀ θ y, V (θ + 1) y = V θ y) →
    (∀ θ, Breakdown.IsWeakGradient (V θ) (G θ)) →
    (∀ θ, ∀ᵐ y, ∑ i : Fin 3, (G θ y (Breakdown.unitVector i)) i = 0) →
    (∀ θ, ∫⁻ y, ENNReal.ofReal (‖V θ y‖ ^ 6) ≤ ENNReal.ofReal C) →
    (∀ θ, ∫⁻ y, ENNReal.ofReal (‖G θ y‖ ^ 2) ≤ ENNReal.ofReal C) →
    (∀ φ, Breakdown.IsSpaceTimeTestField φ →
      MeasureTheory.Integrable (Breakdown.sigmaSimilarityIntegrand P V G φ) ∧
      (∫ z, Breakdown.sigmaSimilarityIntegrand P V G φ z) = 0) →
    (¬ (∀ᵐ z : ℝ × Breakdown.Space, V z.1 z.2 = 0)) →
    (∃ x : ℝ → Breakdown.Freq.X, Continuous x ∧
      ∀ θ, (Breakdown.Freq.velocity (x θ) : Breakdown.Space → Breakdown.Space) =ᵐ[MeasureTheory.volume] V θ) →
    ∃ (H : Breakdown.Cert.SecondField) (D : ℝ), Breakdown.IsSigmaProfile P V G H D

end NavierStokes

namespace NavierStokes

section AppendixBOpen
open Breakdown Breakdown.AdjointDefect
open MeasureTheory
open scoped ENNReal

/-- Lemma B.11, the joint-integrability target. For a field with the formal
dual bound and a measurable weak H¹ velocity with finite gradient energy
over a period, the scalar product is absolutely integrable on the product
of the period and space and satisfies the dual estimate.
The supplied theorem proves slice integrability and integrability of the
signed spatial integral; those facts alone do not imply this product
integrability. The remaining step is to obtain weighted L² integrability of
the finite angular-mode remainder on the product measure, then apply the
authors' weightedPairingIntegrable_proof. This definition asserts no proof. -/
def lemma_B_11 : Prop :=
  ∀ (R : ℝ → Space → Space) (ρ : ℝ), DualBounded R ρ →
    ∀ (v : ℝ → Space → Space) (G : ℝ → Space → (Space →L[ℝ] Space)),
      AEStronglyMeasurable (fun z : ℝ × Space => v z.1 z.2) volume →
      AEStronglyMeasurable (fun z : ℝ × Space => G z.1 z.2) volume →
      (∀ᵐ σ, IsWeakGradient (v σ) (G σ)) →
      (∀ᵐ σ, ∫⁻ y, ENNReal.ofReal (‖v σ y‖ ^ 6) < ⊤) →
      periodLIntegral (fun σ y => matSq (G σ y)) < ⊤ →
      Integrable (fun z : ℝ × Space => inner ℝ (v z.1 z.2) (R z.1 z.2))
        ((volume.restrict (Set.Icc (0 : ℝ) 1)).prod volume) ∧
      |periodInnerIntegral v R| ≤ ρ * gradientNorm G

end AppendixBOpen

end NavierStokes
