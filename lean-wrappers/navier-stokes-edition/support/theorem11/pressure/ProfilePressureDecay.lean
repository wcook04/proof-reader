import TimePressure
import IntervalBounds
import PaperPressureSource
import PressureWeakIdentification
import NewtonTime

open MeasureTheory Breakdown Breakdown.FarField
open scoped ContDiff

namespace ProfileDecay

/-- Cubic pressure-gradient decay for every printed profile whose velocity
satisfies the additional second spatial derivative bound. -/
theorem pressureGradientDecay_of_hessian {W : Theorem11.Velocity} {q : Theorem11.Pressure}
    {P A B : ℝ} {R : Space ≃ₗᵢ[ℝ] Space} (h : Theorem11.IsPaperProfile W q P R A)
    (hess : ∀ s y, ‖iteratedFDeriv ℝ 2 (W s) y‖ ≤ B / (1 + ‖y‖) ^ 3) :
    ∃ D : ℝ, ∀ s y, ‖fderiv ℝ (q s) y‖ ≤ D / (1 + ‖y‖) ^ 3 := by
  obtain ⟨M, hm⟩ := paperPressureSourceBound h
  obtain ⟨N, hn⟩ := paperNewtonBound h hess
  have hq := h.2.2.1
  have hg := paperSourceSmooth h
  have hquart := fun s => (hm s).2
  refine ⟨3 * |N|, fun s y => ?_⟩
  have coord (i : Fin 3) :
      |fderiv ℝ (q s) y (unitVector i)| ≤ |N| / (1 + ‖y‖)^3 := by
    have hjoint : ContDiff ℝ ∞ (fun z : ℝ × Space => fderiv ℝ (q z.1) z.2) :=
      ContDiff.fderiv (f := fun (z : ℝ × Space) => q z.1)
        (hq.comp ((contDiff_fst.comp contDiff_fst).prodMk contDiff_snd)) contDiff_snd (by simp)
    apply pointBoundOfIntervals
      ((hjoint.clm_apply (contDiff_const (c := unitVector i))).continuous.comp
        (continuous_id.prodMk (continuous_const (y := y)))) (by positivity) _ s
    intro a b
    have hlap (z : Space) : FundSol.scalarSumSecondPartials (timeIntegral q a b) z =
        -(timeIntegral (pressureSource W) a b z) := by
      rw [laplacian_timeIntegral hq]
      simp_rw [paperPressureLaplacian h]
      exact intervalIntegral.integral_neg
    have havg (z : Space) : |timeIntegral (pressureSource W) a b z| ≤
        (M * |b-a|) / (1 + ‖z‖)^4 := by
      calc
        |timeIntegral (pressureSource W) a b z| ≤ M / (1 + ‖z‖)^4 * |b-a| :=
          intervalIntegral.norm_integral_le_of_norm_le_const (f := fun t => pressureSource W t z) (fun t _ => hquart t z)
        _ = _ := by ring
    have he := pressureIdentification_of_inverseDistance (smooth_timeIntegral hq a b)
      (smooth_timeIntegral hg a b) hlap (primitive_fderiv_bound h hess a b) havg i y
    rw [fderiv_timeIntegral_apply hq, newtonGradientComp_timeIntegral (g := pressureSource W) hg.continuous hquart] at he
    change |∫ t in a..b, fderiv ℝ (q t) y (unitVector i)| ≤ _
    rw [he, abs_neg]
    apply intervalIntegral.norm_integral_le_of_norm_le_const (f := fun t => newtonGradientComp (pressureSource W t) i y)
    intro t _
    exact (hn t y i).trans (div_le_div_of_nonneg_right (le_abs_self _) (by positivity))
  calc
    _ ≤ ∑ i, |fderiv ℝ (q s) y (unitVector i)| := Internal.opNorm_le_sum_abs _
    _ ≤ ∑ _i : Fin 3, |N| / (1 + ‖y‖)^3 := Finset.sum_le_sum fun i _ => coord i
    _ = _ := by simp; ring

#print axioms pressureGradientDecay_of_hessian

end ProfileDecay
