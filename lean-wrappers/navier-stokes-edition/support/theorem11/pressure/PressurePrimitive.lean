import Mathlib
import Theorem11Challenge

open MeasureTheory Theorem11
open scoped ContDiff

namespace ProfileDecay

private theorem trace_bound (v : VectorField) (y : Space) :
    ‖laplacianAt v y‖ ≤ 3 * ‖iteratedFDeriv ℝ 2 v y‖ := by
  apply (norm_sum_le _ _).trans
  calc
    _ ≤ ∑ _ : Fin 3, ‖iteratedFDeriv ℝ 2 v y‖ := by
      apply Finset.sum_le_sum
      intro i _
      simpa [Fin.prod_univ_two, unitVector] using
        (iteratedFDeriv ℝ 2 v y).le_opNorm ![unitVector i, unitVector i]
    _ = _ := by simp

/-- Integrating in similarity time avoids any requirement to bound the time
derivative at spatial infinity. B is an explicit, additional Hessian bound. -/
theorem pressurePrimitive {W : Velocity} {q : Pressure} {P A B : ℝ}
    {R : Space ≃ₗᵢ[ℝ] Space} (h : IsPaperProfile W q P R A)
    (hess : ∀ s y, ‖iteratedFDeriv ℝ 2 (W s) y‖ ≤ B / (1 + ‖y‖) ^ 3)
    (a b : ℝ) (y : Space) :
    ‖∫ s in a..b, pressureGradientAt (q s) y‖ ≤
      (2 * A + |b-a| * (A + 3*B + A^2)) / (1 + ‖y‖) := by
  obtain ⟨_, hw, hq, heq, _, _, _, h0, h1⟩ := h
  let r := 1 + ‖y‖
  have hr : 1 ≤ r := by dsimp [r]; linarith [norm_nonneg y]
  have hr₀ : 0 < r := by linarith
  have hA : 0 ≤ A := by simpa using (norm_nonneg _).trans (h0 0 0)
  have hB : 0 ≤ B := by simpa using (norm_nonneg _).trans (hess 0 0)
  let w := fun s => W s y
  let p := fun s => pressureGradientAt (q s) y
  have hsp : ContDiff ℝ ∞ w := hw.comp (contDiff_id.prodMk contDiff_const)
  have hc : Continuous p := by
    apply continuous_finsetSum
    intro i _
    have hj : Continuous (fun s : ℝ =>
        fderiv ℝ (fun z : ℝ × Space => q z.1 z.2) (s,y) (0,unitVector i)) :=
      ((hq.continuous_fderiv (by simp)).comp
        (continuous_id.prodMk continuous_const)).clm_apply continuous_const
    have hcoord : Continuous (fun s => fderiv ℝ (q s) y (unitVector i)) := by
      convert hj using 1
      funext s
      exact congrArg (fun L : Space →L[ℝ] ℝ => L (unitVector i))
        (((hq.differentiable (by simp) (s,y)).hasFDerivAt.comp y
          (hasFDerivAt_prodMk_right (𝕜 := ℝ) s y)).fderiv)
    exact hcoord.smul (continuous_const (y := unitVector i))
  have hd := (hsp.continuous_deriv (by simp)).intervalIntegrable (a := a) (b := b) (μ := volume)
  have hbnd (s : ℝ) : ‖deriv w s + p s‖ ≤ (A + 3*B + A^2) / r := by
    have he := heq s y
    unfold similarityResidual at he
    have eq : deriv w s + p s = laplacianAt (W s) y - advectionAt (W s) y -
        (1/2 : ℝ) • W s y - (1/2 : ℝ) • fderiv ℝ (W s) y y := by
      dsimp [w,p]; abel_nf at he ⊢; linear_combination (norm := abel) he
    have hL : ‖laplacianAt (W s) y‖ ≤ 3 * (B / r^3) :=
      (trace_bound _ _).trans (by gcongr; exact hess s y)
    have hN : ‖advectionAt (W s) y‖ ≤ A / r^2 * (A/r) :=
      ((fderiv ℝ (W s) y).le_opNorm _).trans
        (mul_le_mul (h1 s y) (h0 s y) (norm_nonneg _) (by positivity))
    have hD := ((fderiv ℝ (W s) y).le_opNorm y).trans
      (mul_le_mul_of_nonneg_right (h1 s y) (norm_nonneg y))
    rw [eq]
    calc
      _ ≤ ‖laplacianAt (W s) y‖ + ‖advectionAt (W s) y‖ +
          ‖(1/2 : ℝ) • W s y‖ + ‖(1/2 : ℝ) • fderiv ℝ (W s) y y‖ := by
        grw [norm_sub_le, norm_sub_le, norm_sub_le]
      _ ≤ 3*(B/r^3) + A/r^2*(A/r) + (1/2)*(A/r) + (1/2)*(A/r^2 * r) := by
        simp only [norm_smul, Real.norm_eq_abs, abs_of_nonneg (by norm_num : (0:ℝ) ≤ 1/2)]
        have hy : ‖y‖ ≤ r := by dsimp [r]; linarith
        gcongr
        · exact h0 s y
        · exact hD.trans (mul_le_mul_of_nonneg_left hy (by positivity))
      _ = (3*B + A^2)/r^3 + A/r := by field_simp; ring
      _ ≤ _ := by
        rw [show (A + 3*B + A^2)/r = (3*B + A^2)/r + A/r by ring]
        gcongr
        exact le_self_pow₀ hr (by norm_num)
  have hi := intervalIntegral.norm_integral_le_of_norm_le_const (a := a) (b := b)
    (fun s _ => hbnd s)
  rw [intervalIntegral.integral_add hd (hc.intervalIntegrable _ _),
    intervalIntegral.integral_eq_sub_of_hasDerivAt
      (fun t _ => (hsp.differentiable (by simp) t).hasDerivAt) hd] at hi
  have he : (∫ s in a..b, p s) = ((w b - w a) + ∫ s in a..b, p s) - (w b - w a) := by abel
  change ‖∫ s in a..b, p s‖ ≤ _
  calc
    _ ≤ ‖(w b - w a) + ∫ s in a..b, p s‖ + (‖w b‖ + ‖w a‖) := by
      conv_lhs => rw [he]
      grw [norm_sub_le, norm_sub_le]
    _ ≤ (A + 3*B + A^2)/r * |b-a| + (A/r + A/r) :=
      add_le_add hi (add_le_add (h0 b y) (h0 a y))
    _ = _ := by change _ = _ / r; ring

end ProfileDecay

#print axioms ProfileDecay.pressurePrimitive
