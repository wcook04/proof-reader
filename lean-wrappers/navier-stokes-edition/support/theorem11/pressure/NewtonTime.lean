import IntervalBounds
import TimePressure
import Breakdown.CertTorus.DecayStatements
import Breakdown.Uniqueness.FundSolKernel
import Breakdown.Uniqueness.FundSolPointwiseAux

open MeasureTheory Breakdown Breakdown.FarField
open scoped ContDiff

namespace ProfileDecay

/-- Time integration commutes with the Newton gradient on uniformly quartic-decaying sources. -/
theorem newtonGradientComp_timeIntegral {g : ℝ → Space → ℝ} {D : ℝ}
    (hg : Continuous (Function.uncurry g))
    (hb : ∀ s z, |g s z| ≤ D / (1 + ‖z‖)^4) (a b : ℝ) (i : Fin 3) (y : Space) :
    newtonGradientComp (timeIntegral g a b) i y =
      ∫ s in a..b, newtonGradientComp (g s) i y := by
  let c : ℝ := (4 * Real.pi)⁻¹
  have hc : 0 ≤ c := by dsimp [c]; positivity
  let near := fun z : Space => FundSol.Internal.ballPow 2 1 (y-z)
  let far := fun z : Space => ((1 + ‖z‖)^4)⁻¹
  have hnear : Integrable near :=
    (FundSol.Internal.integrable_ballPow (n := 2) le_rfl 1).comp_sub_left y
  have hfar : Integrable far := by
    have hi : Integrable (fun z : Space => (1 + ‖z‖) ^ (-(4:ℝ))) :=
      integrable_one_add_norm (by simp; norm_num)
    simpa [far, Real.rpow_neg_ofNat] using hi
  have hD : 0 ≤ D := by simpa using (abs_nonneg _).trans (hb 0 0)
  unfold newtonGradientComp timeIntegral
  refine swapTimeSpace (K := fun z : Space => FundSol.kernelGrad (y-z) i)
    (m := fun z => (c*D) * (near z + far z)) ?_ hg.measurable
    ((hnear.add hfar).const_mul _) ?_ a b
  · unfold FundSol.kernelGrad
    fun_prop
  · intro s z
    have hK : |FundSol.kernelGrad (y-z) i| ≤ c * ‖y-z‖⁻¹^2 := by
      simpa [Real.norm_eq_abs, FundSol.norm_kernelGrad, c] using
        PiLp.norm_apply_le (FundSol.kernelGrad (y-z)) i
    have hg' : |g s z| ≤ D * far z := by simpa [far, div_eq_mul_inv] using hb s z
    rw [abs_mul]
    have hfar0 : 0 ≤ far z := by dsimp [far]; positivity
    rcases lt_or_ge ‖y-z‖ 1 with h | h
    · have hnear' : near z = ‖y-z‖⁻¹^2 := FundSol.Internal.ballPow_of_lt h
      have hfd : far z ≤ 1 := by
        apply inv_le_one_of_one_le₀
        exact one_le_pow₀ (by linarith [norm_nonneg z])
      calc
        _ ≤ (c * ‖y-z‖⁻¹^2) * D := mul_le_mul hK
          (hg'.trans (by simpa using mul_le_mul_of_nonneg_left hfd hD)) (abs_nonneg _) (by positivity)
        _ = (c*D) * near z := by rw [hnear']; ring
        _ ≤ _ := by gcongr; linarith
    · have hnear' : near z = 0 := FundSol.Internal.ballPow_of_le h
      have hk : ‖y-z‖⁻¹^2 ≤ 1 :=
        pow_le_one₀ (by positivity) (inv_le_one_of_one_le₀ h)
      calc
        _ ≤ c * (D * far z) := mul_le_mul
          (hK.trans (by simpa using mul_le_mul_of_nonneg_left hk hc)) hg' (abs_nonneg _) hc
        _ = _ := by rw [hnear']; ring

end ProfileDecay

#print axioms ProfileDecay.newtonGradientComp_timeIntegral
