import EditionContracts
import ProfilePressureDecay

open scoped ContDiff

namespace ProfileDecay

/-- The pressure step, stated with the reader's existing input and output definitions. -/
theorem paperPressureContract (W : Theorem11.Velocity) (q : Theorem11.Pressure)
    (S : ℝ) (R : Theorem11.Space ≃ₗᵢ[ℝ] Theorem11.Space) (A : ℝ)
    (profile : Theorem11.IsPaperProfile W q S R A)
    (hessian : ∃ B : ℝ, ∀ s y, ‖iteratedFDeriv ℝ 2 (W s) y‖ ≤ B / (1 + ‖y‖)^3) :
    ∃ D : ℝ, NavierStokes.PressureGradientDecay q D := by
  obtain ⟨B, bound⟩ := hessian
  exact pressureGradientDecay_of_hessian profile bound

/-- Recover the two existing edition premises with a single constant for the
same profile, assuming its velocity estimates through order two. -/
theorem velocityDecay_supplies_pressure (W : Theorem11.Velocity) (q : Theorem11.Pressure)
    (S : ℝ) (R : Theorem11.Space ≃ₗᵢ[ℝ] Theorem11.Space) (A : ℝ)
    (h : NavierStokes.ProfileWithVelocityDecay W q S R A) :
    ∃ C : ℝ, NavierStokes.ProfileWithVelocityDecay W q S R C ∧
      NavierStokes.PressureGradientDecay q C := by
  obtain ⟨hS, hW, hq, he, hd, hr, hn, hv⟩ := h
  have hp : Theorem11.IsPaperProfile W q S R A :=
    ⟨hS, hW, hq, he, hd, hr, hn,
      fun s y => by simpa using hv s y 0 (by decide),
      fun s y => by simpa [norm_iteratedFDeriv_one] using hv s y 1 (by decide)⟩
  obtain ⟨D, hD⟩ := paperPressureContract W q S R A hp ⟨A, fun s y => hv s y 2 (by decide)⟩
  refine ⟨max A D, ⟨hS, hW, hq, he, hd, hr, hn, ?_⟩, ?_⟩
  · intro s y j hj
    exact (hv s y j hj).trans (div_le_div_of_nonneg_right (le_max_left _ _) (by positivity))
  · intro s y
    exact (hD s y).trans (div_le_div_of_nonneg_right (le_max_right _ _) (by positivity))

#print axioms paperPressureContract
#print axioms velocityDecay_supplies_pressure

end ProfileDecay
