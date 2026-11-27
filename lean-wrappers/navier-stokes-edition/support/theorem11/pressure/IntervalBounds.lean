import Mathlib

open MeasureTheory Set Filter
open scoped Topology

namespace ProfileDecay

/-- An interval estimate with the same constant on every interval controls a
continuous integrand at every time, including exceptional times. -/
theorem pointBoundOfIntervals {p : ℝ → ℝ} (hp : Continuous p) {K : ℝ} (hK : 0 ≤ K)
    (h : ∀ a b : ℝ, |∫ s in a..b, p s| ≤ K * |b-a|) (s : ℝ) : |p s| ≤ K := by
  let P := fun t : ℝ => ∫ u in (0:ℝ)..t, p u
  have hi (a b : ℝ) := hp.intervalIntegrable (μ := volume) a b
  have hl : LipschitzWith ⟨K,hK⟩ P := by
    apply LipschitzWith.of_dist_le_mul
    intro x y
    have he := intervalIntegral.integral_add_adjacent_intervals (hi 0 y) (hi y x)
    have he' : P x - P y = ∫ u in y..x, p u := by dsimp [P]; linarith
    simp only [Real.dist_eq, he']; exact h y x
  have hd : HasDerivAt P (p s) s :=
    intervalIntegral.integral_hasDerivAt_right (hi 0 s)
      hp.stronglyMeasurable.stronglyMeasurableAtFilter hp.continuousAt
  have bound : ‖deriv P s‖ ≤ K := norm_deriv_le_of_lipschitz (x₀ := s) hl
  rwa [hd.deriv, Real.norm_eq_abs] at bound

/-- Swap a compact time integral with a weighted spatial integral using a
single spatial integrable majorant for the product. -/
theorem swapTimeSpace {X : Type*} [MeasurableSpace X] {μ : Measure X} [SFinite μ]
    {K : X → ℝ} (hK : Measurable K) {g : ℝ → X → ℝ}
    (hg : Measurable (Function.uncurry g)) {m : X → ℝ} (hm : Integrable m μ)
    (hb : ∀ s z, |K z * g s z| ≤ m z) (a b : ℝ) :
    (∫ z, K z * (∫ s in a..b, g s z) ∂μ) =
      ∫ s in a..b, ∫ z, K z * g s z ∂μ := by
  let ν := volume.restrict (uIoc a b)
  have : IsFiniteMeasure ν := ⟨by simp [ν, uIoc]⟩
  have prodInt : Integrable (fun w : ℝ × X => K w.2 * g w.1 w.2) (ν.prod μ) := by
    apply (hm.comp_snd ν).mono' ((hK.comp measurable_snd).mul hg).aestronglyMeasurable
    exact Eventually.of_forall fun w => by change |K w.2 * g w.1 w.2| ≤ m w.2; exact hb w.1 w.2
  rw [intervalIntegral_integral_swap (f := fun s z => K z * g s z) prodInt]
  simp only [intervalIntegral.integral_const_mul]

end ProfileDecay
