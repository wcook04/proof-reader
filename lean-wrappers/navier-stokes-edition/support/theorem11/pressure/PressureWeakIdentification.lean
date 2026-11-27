import Breakdown.CertTorus.RadialWeightBound
import Breakdown.CertTorus.HarmonicMeanValue
import Breakdown.CertTorus.HarmonicGradientBound
import Breakdown.CertTorus.TruncatedNewton
import Breakdown.Uniqueness.FundSolByParts

open Breakdown Breakdown.FarField MeasureTheory Metric Filter Topology
open scoped ContDiff

noncomputable section

namespace ProfileDecay

private theorem insideCutoff {r : ℝ} (hr : 0 < r) {z : Space} (hz : ‖z‖ ≤ r) :
    ballCutoff r z = 1 := by
  apply Real.smoothTransition.one_of_one_le
  have h : ‖z‖ ^ 2 / r ^ 2 ≤ 1 := (div_le_one (by positivity)).2
    (pow_le_pow_left₀ (norm_nonneg _) hz 2)
  linarith

private theorem cutoffCompact {r : ℝ} (hr : 0 < r) (g : Space → ℝ) :
    HasCompactSupport (fun z => ballCutoff r z * g z) := by
  refine HasCompactSupport.intro (isCompact_closedBall 0 (2 * r)) ?_
  intro z hz
  suffices ballCutoff r z = 0 by simp [this]
  apply Real.smoothTransition.zero_of_nonpos
  have hz' : 2 * r < ‖z‖ := by simpa [mem_closedBall, not_le] using hz
  have h : 2 ≤ ‖z‖ ^ 2 / r ^ 2 := (le_div_iff₀ (by positivity)).2 (by
    nlinarith [sq_nonneg (‖z‖ - 2*r), mul_nonneg hr.le (sub_nonneg.mpr hz'.le)])
  linarith

private theorem shiftBall {y : Space} {r : ℝ} (hy : ‖y‖ ≤ r) :
    ball y r ⊆ ball 0 (2 * r) := by
  intro z hz
  have h : ‖z - y‖ < r := by simpa [mem_ball, dist_eq_norm] using hz
  simpa [mem_ball] using (show ‖z‖ < 2 * r by linarith [norm_le_norm_add_norm_sub' z y])

/-- The Dirichlet energy of an inverse-distance field grows at most linearly on large balls. -/
private theorem linearEnergy (f : Space → Space →L[ℝ] ℝ) {K r : ℝ} {y : Space}
    (hf : ∀ z, ‖f z‖ ≤ K / (1 + ‖z‖)) (hr : 0 < r) (hy : ‖y‖ ≤ r) :
    ∫ z in ball y r, ‖f z‖ ^ 2 ≤ (6 * volume.real (ball (0 : Space) 1) * K^2) * r := by
  let w : Space → ℝ := fun z => (1 + ‖z‖) ^ (-(2 : ℝ))
  have hw : Continuous w := by
    apply Continuous.rpow_const (continuous_const.add continuous_norm)
    intro z
    exact Or.inl (show 1 + ‖z‖ ≠ 0 by positivity)
  have hi := FarField.Internal.integrableOn_ball_of_continuous hw (0 : Space) (2 * r)
  have hpos (z : Space) : 0 ≤ w z := Real.rpow_nonneg (by positivity) _
  have hball := shiftBall hy
  have hrad := RadialWeightInternal.radial_bound (a := 1) (γ := 2) (r := 2*r)
    (by norm_num) (by norm_num) (by norm_num) (by positivity)
  have hrad' : (∫ z in ball (0 : Space) (2*r), w z) ≤
      3 * volume.real (ball (0 : Space) 1) * (2*r) := by
    norm_num [w] at hrad ⊢
    exact hrad
  calc
    _ ≤ ∫ z in ball y r, K^2 * w z := by
      apply integral_mono_of_nonneg (ae_of_all _ (fun z => sq_nonneg _))
        ((hi.mono_set hball).const_mul _)
      apply ae_of_all
      intro z
      simpa [w, Real.rpow_neg (show 0 ≤ 1 + ‖z‖ by positivity), Real.rpow_two, div_eq_mul_inv, mul_pow, inv_pow]
        using pow_le_pow_left₀ (norm_nonneg _) (hf z) 2
    _ = K^2 * ∫ z in ball y r, w z := integral_const_mul _ _
    _ ≤ K^2 * ∫ z in ball (0 : Space) (2*r), w z := by
      exact mul_le_mul_of_nonneg_left
        (setIntegral_mono_set hi (ae_of_all _ hpos) hball.eventuallyLE) (sq_nonneg _)
    _ ≤ K^2 * (3 * volume.real (ball (0 : Space) 1) * (2*r)) :=
      mul_le_mul_of_nonneg_left hrad' (sq_nonneg _)
    _ = _ := by ring

/-- Identify the pressure gradient from its Poisson source under inverse-distance
decay. Harmonic interior estimates only need subcubic energy growth. -/
theorem pressureIdentification_of_inverseDistance {q g : Space → ℝ} {A K : ℝ}
    (hq : ContDiff ℝ ∞ q) (hg : ContDiff ℝ ∞ g)
    (hLap : ∀ x, FundSol.scalarSumSecondPartials q x = -g x)
    (hqK : ∀ x, ‖fderiv ℝ q x‖ ≤ K / (1 + ‖x‖))
    (hgA : ∀ x, |g x| ≤ A / (1 + ‖x‖)^4) (i : Fin 3) (y : Space) :
    fderiv ℝ q y (unitVector i) = -newtonGradientComp g i y := by
  obtain ⟨C, hC⟩ := harmonicGradientBound_of_meanValue harmonicMeanValue_holds
  obtain ⟨⟨D, hD⟩, hlim⟩ := truncatedNewton_holds g A hg hgA
  let P (r : ℝ) := FundSol.potential (fun z => ballCutoff (2*r) z * g z)
  have hcut (r : ℝ) : ContDiff ℝ ∞ (fun z => ballCutoff (2*r) z * g z) :=
    (Real.smoothTransition.contDiff.comp (contDiff_const.sub
      ((contDiff_norm_sq ℝ).div_const _))).mul hg
  have hP (r : ℝ) (hr : 0 < r) : ContDiff ℝ ∞ (P r) :=
    FundSol.contDiff_potential (hcut r) (cutoffCompact (by positivity) _)
  let M := 6 * volume.real (ball (0 : Space) 1) * (K + |D|)^2
  have hM : 0 ≤ M := by dsimp [M]; positivity
  have hsum (r : ℝ) (hr : 0 < r) (z : Space) :
      fderiv ℝ (q + P r) z = fderiv ℝ q z + fderiv ℝ (P r) z :=
    fderiv_add (hq.differentiable (by simp) z) ((hP r hr).differentiable (by simp) z)
  have hbound (r : ℝ) (hr : 1 ≤ r) (hy : ‖y‖ ≤ r) :
      ‖fderiv ℝ (q + P r) y‖ ≤ (|C| * M^(1/2 : ℝ)) * r⁻¹ := by
    have hr' : 0 < r := by linarith
    have hG := hq.add (hP r hr')
    have hh : ∀ z ∈ ball y r, FundSol.scalarSumSecondPartials (q + P r) z = 0 := by
      intro z hz
      have hinside : ‖z‖ < 2*r := by simpa [mem_ball] using shiftBall hy hz
      have h2 : (2 : WithTop ℕ∞) ≤ ∞ := WithTop.coe_le_coe.2 le_top
      have e : FundSol.scalarSumSecondPartials (q + P r) z =
          FundSol.scalarSumSecondPartials q z + FundSol.scalarSumSecondPartials (P r) z := by
        unfold FundSol.scalarSumSecondPartials FundSol.secondPartial
        rw [← Finset.sum_add_distrib]
        apply Finset.sum_congr rfl
        intro j _
        rw [iteratedFDeriv_add_apply (hq.of_le h2).contDiffAt ((hP r hr').of_le h2).contDiffAt]
        rfl
      rw [e, hLap, show FundSol.scalarSumSecondPartials (P r) z = _ from
        FundSol.scalarSumSecondPartials_potential (hcut r) (cutoffCompact (by positivity) _) z,
        insideCutoff (by positivity) hinside.le, one_mul, neg_add_cancel]
    have hpt (z : Space) : ‖fderiv ℝ (q + P r) z‖ ≤ (K + |D|) / (1 + ‖z‖) := by
      have hn : 1 ≤ 1 + ‖z‖ := by linarith [norm_nonneg z]
      have hd : 0 < 1 + ‖z‖ := by positivity
      rw [hsum r hr' z, add_div]
      refine (norm_add_le _ _).trans (add_le_add (hqK z) ((hD (2*r) (by linarith) z).trans ?_))
      exact (div_le_div_of_nonneg_right (le_abs_self D) (by positivity)).trans
        (div_le_div_of_nonneg_left (abs_nonneg _) hd (by nlinarith [mul_nonneg hd.le (sub_nonneg.mpr hn)]))
    have he := linearEnergy (fderiv ℝ (q + P r)) hpt hr' hy
    have hp : 0 ≤ ∫ z in ball y r, ‖fderiv ℝ (q + P r) z‖ ^ 2 :=
      integral_nonneg fun _ => sq_nonneg _
    calc
      _ ≤ _ := hC _ _ _ hr' hG hh
      _ ≤ |C| * r ^ (-(3/2 : ℝ)) * (M*r)^(1/2 : ℝ) := by
        apply mul_le_mul _ (Real.rpow_le_rpow hp he (by norm_num)) (Real.rpow_nonneg hp _) (by positivity)
        exact mul_le_mul_of_nonneg_right (le_abs_self _) (Real.rpow_nonneg hr'.le _)
      _ = _ := by
        rw [Real.mul_rpow hM hr'.le]
        calc _ = |C| * M^(1/2 : ℝ) * (r^(-(3/2 : ℝ)) * r^(1/2 : ℝ)) := by ring
             _ = _ := by rw [← Real.rpow_add hr', show -(3/2 : ℝ) + 1/2 = -1 by norm_num, Real.rpow_neg_one]
  have hzero : Tendsto (fun r => fderiv ℝ q y (unitVector i) + fderiv ℝ (P r) y (unitVector i))
      atTop (𝓝 0) := by
    apply squeeze_zero_norm' _ (by simpa using tendsto_inv_atTop_zero.const_mul (|C| * M^(1/2 : ℝ)))
    filter_upwards [eventually_ge_atTop (1 : ℝ), eventually_ge_atTop ‖y‖] with r hr hy
    have hr' : 0 < r := by linarith
    have hb := (fderiv ℝ (q + P r) y).le_opNorm (unitVector i)
    rw [show ‖unitVector i‖ = 1 by simp [unitVector], mul_one] at hb
    simpa only [hsum r hr' y, _root_.add_apply, one_div] using hb.trans (hbound r hr hy)
  have ht : Tendsto (fun r : ℝ => 2*r) atTop atTop := tendsto_id.const_mul_atTop (by norm_num)
  have hl : Tendsto (fun r => fderiv ℝ q y (unitVector i) + fderiv ℝ (P r) y (unitVector i))
      atTop (𝓝 (fderiv ℝ q y (unitVector i) + newtonGradientComp g i y)) :=
    tendsto_const_nhds.add ((hlim i y).comp ht)
  linarith [tendsto_nhds_unique hl hzero]

end ProfileDecay

#print axioms ProfileDecay.pressureIdentification_of_inverseDistance
