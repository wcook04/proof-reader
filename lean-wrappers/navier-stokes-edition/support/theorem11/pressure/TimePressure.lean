import PressurePrimitive
import Breakdown.Uniqueness.FundSolDefs

open MeasureTheory Set Theorem11
open scoped ContDiff

noncomputable section

namespace ProfileDecay

variable {E : Type} [NormedAddCommGroup E] [NormedSpace ℝ E]

/-- Signed time integral at a fixed point in similarity space. -/
def timeIntegral (f : ℝ → Space → E) (a b : ℝ) (y : Space) : E :=
  ∫ s in a..b, f s y

private theorem spatialDeriv_smooth {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) :
    ContDiff ℝ ∞ (fun z : ℝ × Space => fderiv ℝ (f z.1) z.2) := by
  let F := fun z : ℝ × Space => f z.1 z.2
  have heq (z : ℝ × Space) : fderiv ℝ (f z.1) z.2 =
      (fderiv ℝ F z).comp (ContinuousLinearMap.inr ℝ ℝ Space) :=
    by
      have H : HasFDerivAt F (fderiv ℝ F z) (z.1,z.2) :=
        (hf.differentiable (by simp) z).hasFDerivAt
      exact (H.comp z.2 (hasFDerivAt_prodMk_right (𝕜 := ℝ) z.1 z.2)).fderiv
  simp_rw [heq]
  exact (contDiff_infty_iff_fderiv.mp hf).2.clm_comp contDiff_const

private theorem hasFDerivAt_timeIntegral {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) (y : Space) :
    HasFDerivAt (timeIntegral f a b) (∫ s in a..b, fderiv ℝ (f s) y) y := by
  have hd := spatialDeriv_smooth hf
  obtain ⟨M, hM⟩ := ((isCompact_uIcc (a := a) (b := b)).prod
    (isCompact_closedBall y 1)).exists_bound_of_continuousOn hd.continuous.continuousOn
  have hs (x : Space) : Continuous (fun s => f s x) :=
    hf.continuous.comp (continuous_id.prodMk continuous_const)
  have hx (s : ℝ) : Differentiable ℝ (f s) :=
    (hf.comp (contDiff_const.prodMk contDiff_id)).differentiable (by simp)
  apply intervalIntegral.hasFDerivAt_integral_of_dominated_of_fderiv_le
    (F' := fun x s => fderiv ℝ (f s) x) (bound := fun _ => M) (Metric.ball_mem_nhds y one_pos)
  · exact Filter.Eventually.of_forall fun x => (hs x).aestronglyMeasurable
  · exact (hs y).intervalIntegrable _ _
  · exact (hd.continuous.comp (continuous_id.prodMk continuous_const)).aestronglyMeasurable
  · exact Filter.Eventually.of_forall fun s hs x hx =>
      hM (s,x) ⟨Ioc_subset_Icc_self hs, Metric.ball_subset_closedBall hx⟩
  · exact intervalIntegrable_const
  · exact Filter.Eventually.of_forall fun s _ x _ => (hx s x).hasFDerivAt

theorem fderiv_timeIntegral {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) :
    fderiv ℝ (timeIntegral f a b) = timeIntegral (fun s => fderiv ℝ (f s)) a b :=
  funext fun y => (hasFDerivAt_timeIntegral hf a b y).fderiv

theorem smooth_timeIntegral {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) :
    ContDiff ℝ ∞ (timeIntegral f a b) := by
  apply contDiff_infty.mpr
  intro n
  induction n generalizing E with
  | zero => exact contDiff_zero.mpr (continuous_iff_continuousAt.mpr fun y =>
      (hasFDerivAt_timeIntegral hf a b y).continuousAt)
  | succ n ih =>
      rw [Nat.cast_succ, contDiff_succ_iff_fderiv]
      refine ⟨fun y => (hasFDerivAt_timeIntegral hf a b y).differentiableAt, by simp, ?_⟩
      rw [fderiv_timeIntegral hf]
      exact ih (spatialDeriv_smooth hf)

theorem fderiv_timeIntegral_apply {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) (y u : Space) :
    fderiv ℝ (timeIntegral f a b) y u = ∫ s in a..b, fderiv ℝ (f s) y u := by
  rw [fderiv_timeIntegral hf]
  exact ContinuousLinearMap.intervalIntegral_apply
    (((spatialDeriv_smooth hf).continuous.comp
      (continuous_id.prodMk continuous_const)).intervalIntegrable a b) u

theorem second_timeIntegral_apply {f : ℝ → Space → E}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) (y u v : Space) :
    iteratedFDeriv ℝ 2 (timeIntegral f a b) y ![u,v] =
      ∫ s in a..b, iteratedFDeriv ℝ 2 (f s) y ![u,v] := by
  simp only [iteratedFDeriv_two_apply, Matrix.cons_val_zero, Matrix.cons_val_one]
  rw [fderiv_timeIntegral hf, fderiv_timeIntegral_apply (spatialDeriv_smooth hf)]
  apply ContinuousLinearMap.intervalIntegral_apply
  exact (((spatialDeriv_smooth (f := fun s => fderiv ℝ (f s)) (spatialDeriv_smooth hf)).continuous.comp
    (continuous_id.prodMk continuous_const)).clm_apply continuous_const).intervalIntegrable a b

/-- The pressure Poisson equation can be integrated on each signed time interval. -/
theorem laplacian_timeIntegral {f : ℝ → Space → ℝ}
    (hf : ContDiff ℝ ∞ (fun z : ℝ × Space => f z.1 z.2)) (a b : ℝ) (y : Space) :
    Breakdown.FundSol.scalarSumSecondPartials (timeIntegral f a b) y =
      ∫ s in a..b, Breakdown.FundSol.scalarSumSecondPartials (f s) y := by
  unfold Breakdown.FundSol.scalarSumSecondPartials Breakdown.FundSol.secondPartial
  simp_rw [second_timeIntegral_apply hf]
  symm
  apply intervalIntegral.integral_finsetSum
  intro i _
  simp_rw [iteratedFDeriv_two_apply]
  exact ((((spatialDeriv_smooth (f := fun s => fderiv ℝ (f s)) (spatialDeriv_smooth hf)).continuous.comp
    (continuous_id.prodMk continuous_const)).clm_apply continuous_const).clm_apply
    continuous_const).intervalIntegrable a b

private theorem pressureGradient_dual (p : Space → ℝ) (y : Space) :
    (InnerProductSpace.toDual ℝ Space) (pressureGradientAt p y) = fderiv ℝ p y := by
  ext v
  have hv : v = ∑ i, v i • unitVector i := by
    ext i; simp [unitVector, Pi.single_apply, apply_ite]
  conv_rhs => rw [hv]
  simp [pressureGradientAt, InnerProductSpace.toDual_apply_apply, unitVector,
    EuclideanSpace.inner_single_left, mul_comm]

theorem primitive_fderiv_bound {W : Velocity} {q : Pressure} {P A B : ℝ}
    {R : Space ≃ₗᵢ[ℝ] Space} (h : IsPaperProfile W q P R A)
    (hess : ∀ s y, ‖iteratedFDeriv ℝ 2 (W s) y‖ ≤ B / (1 + ‖y‖) ^ 3)
    (a b : ℝ) (y : Space) :
    ‖fderiv ℝ (timeIntegral q a b) y‖ ≤
      (2 * A + |b-a| * (A + 3*B + A^2)) / (1 + ‖y‖) := by
  rw [fderiv_timeIntegral h.2.2.1]
  simp only [timeIntegral, ← pressureGradient_dual]
  change ‖∫ s in a..b, (InnerProductSpace.toDual ℝ Space).toLinearIsometry
    (pressureGradientAt (q s) y)‖ ≤ _
  rw [(InnerProductSpace.toDual ℝ Space).toLinearIsometry.intervalIntegral_comp_comm
    (fun s => pressureGradientAt (q s) y)]
  simpa using pressurePrimitive h hess a b y

end ProfileDecay

#print axioms ProfileDecay.smooth_timeIntegral
#print axioms ProfileDecay.second_timeIntegral_apply
#print axioms ProfileDecay.laplacian_timeIntegral
#print axioms ProfileDecay.primitive_fderiv_bound
