import PaperDivergence
import Breakdown.CertTorus.PressureSourceBound
import Breakdown.CertTorus.TensorDerivDecay
import Breakdown.CertTorus.NewtonNear
import Breakdown.CertTorus.NewtonFarIdentity
import Breakdown.CertTorus.NewtonFarEstimate
import Breakdown.CertTorus.NewtonFar

open MeasureTheory Breakdown Breakdown.FarField
open scoped ContDiff

noncomputable section
namespace ProfileDecay

variable {W : Theorem11.Velocity} {q : Theorem11.Pressure}
  {P A B : ℝ} {R : Space ≃ₗᵢ[ℝ] Space}

/-- The spatial source remains smooth when the similarity time varies. -/
theorem paperSourceSmooth (h : Theorem11.IsPaperProfile W q P R A) :
    ContDiff ℝ ∞ (fun z : ℝ × Space => pressureSource W z.1 z.2) := by
  have hw := h.2.1
  have hparam : ContDiff ℝ ∞ (fun p : (ℝ × Space) × Space => W p.1.1 p.2) :=
    hw.comp ((contDiff_fst.comp contDiff_fst).prodMk contDiff_snd)
  have hjac : ContDiff ℝ ∞ (fun z : ℝ × Space => fderiv ℝ (W z.1) z.2) :=
    ContDiff.fderiv (f := fun (z : ℝ × Space) => W z.1) hparam contDiff_snd (by simp)
  have entry (i j : Fin 3) : ContDiff ℝ ∞
      (fun z : ℝ × Space => fderiv ℝ (W z.1) z.2 (unitVector i) j) :=
    (EuclideanSpace.proj j : Space →L[ℝ] ℝ).contDiff.comp (hjac.clm_apply contDiff_const)
  exact ContDiff.sum fun i _ => ContDiff.sum fun j _ => (entry i j).mul (entry j i)

private theorem toWeighted {E : Type*} [Norm E] {F : ℝ → Space → E} (k : ℕ)
    (bound : ∀ s x, ‖F s x‖ ≤ A / (1 + ‖x‖) ^ k) : WeightedBound F k A := by
  intro s x
  rw [Real.rpow_natCast, mul_comm]
  exact (le_div_iff₀ (by positivity)).mp (bound s x)

theorem paperPressureSourceBound (h : Theorem11.IsPaperProfile W q P R A) :
    ∃ C : ℝ, ∀ s, ContDiff ℝ ∞ (pressureSource W s) ∧
      ∀ y, |pressureSource W s y| ≤ C / (1 + ‖y‖) ^ 4 := by
  obtain ⟨_, hw, _, _, _, _, _, _, hd⟩ := h
  exact pressureSourceBound_holds W hw A (toWeighted 2 hd)

/-- A cubic spatial estimate on the Newton part of the pressure gradient. -/
theorem paperNewtonBound (h : Theorem11.IsPaperProfile W q P R A)
    (hess : ∀ s x, ‖iteratedFDeriv ℝ 2 (W s) x‖ ≤ B / (1 + ‖x‖) ^ 3) :
    ∃ C : ℝ, ∀ s x i, |newtonGradientComp (pressureSource W s) i x| ≤
      C / (1 + ‖x‖) ^ 3 := by
  obtain ⟨Cs, hs⟩ := paperPressureSourceBound h
  have hdiv := paperPressureDivDiv h
  obtain ⟨_, hw, _, _, _, _, _, h0, h1⟩ := h
  obtain ⟨Ct, ht⟩ := tensorDerivDecay_holds W hw A A B
    (by simpa only [Nat.cast_one] using (toWeighted 1 (by simpa using h0))) (toWeighted 2 h1) (toWeighted 3 hess)
  obtain ⟨N, near⟩ := newtonNear_holds
  obtain ⟨F, far⟩ := newtonFar_of_identity newtonFarIdentity_holds newtonFarEstimate_holds
  refine ⟨N * Cs + F * Ct, fun s x i => ?_⟩
  obtain ⟨hin, hn⟩ := near _ _ (hs s).1.continuous (hs s).2 i x
  obtain ⟨hif, hf⟩ := far _ _ (ht s).1 (ht s).2 i x
  rw [add_div]
  refine le_trans ?_ (add_le_add hn hf)
  apply le_trans _ (abs_add_le _ _)
  apply le_of_eq
  congr 1
  rw [← integral_add hin hif]
  apply integral_congr_ae
  filter_upwards with z
  simp only [← hdiv s z]
  ring

#print axioms paperPressureLaplacian
#print axioms paperPressureDivDiv
#print axioms paperSourceSmooth
#print axioms paperNewtonBound
end ProfileDecay
