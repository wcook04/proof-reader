import Mathlib.Analysis.SpecialFunctions.Integrals.Basic

open MeasureTheory Set
open scoped Interval

namespace WeightedDuhamel

/-- Transfer part of the endpoint singularity to the time lag.
The remaining power of the lag has an elementary antiderivative. -/
private theorem splitWeight {s t a d : ℝ} (hst : s < t) (ht : t < 1)
    (ha : 0 ≤ a) (hd : 0 ≤ d) :
    (1 - t) ^ a * (1 - s) ^ (-(a + d)) ≤ (t - s) ^ (-d) := by
  have hs := sub_pos.mpr (hst.trans ht)
  have h₁ : (1 - t) ^ a ≤ (1 - s) ^ a :=
    Real.rpow_le_rpow (sub_nonneg.mpr ht.le) (by linarith) ha
  have h₂ : (1 - s) ^ (-d) ≤ (t - s) ^ (-d) :=
    Real.rpow_le_rpow_of_nonpos (sub_pos.mpr hst) (by linarith) (by linarith)
  calc
    _ ≤ (1 - s) ^ a * (1 - s) ^ (-(a + d)) :=
      mul_le_mul_of_nonneg_right h₁ (Real.rpow_nonneg hs.le _)
    _ = (1 - s) ^ (-d) := by rw [← Real.rpow_add hs]; congr 1; ring
    _ ≤ _ := h₂

/-- A weighted estimate for any locally integrable Duhamel integrand.
Here a is the output weight and a+d is the total input weight. -/
theorem endpointEstimate {X : Type*} [NormedAddCommGroup X] [NormedSpace ℝ X]
    {F : ℝ → X} {t a d M : ℝ} (ht : t ∈ Ico (0 : ℝ) 1)
    (ha : 0 ≤ a) (hd : 0 ≤ d) (hd' : d < 1 / 4) (hM : 0 ≤ M)
    (hF : IntervalIntegrable F volume 0 t)
    (hbound : ∀ s ∈ Ioo (0 : ℝ) t,
      ‖F s‖ ≤ M * (t - s) ^ (-(3 / 4 : ℝ)) * (1 - s) ^ (-(a + d))) :
    (1 - t) ^ a * ‖∫ s in (0 : ℝ)..t, F s‖ ≤ M / (1 / 4 - d) := by
  let p : ℝ := -(3 / 4) - d
  have hp : -1 < p := by dsimp [p]; linarith
  have he : p + 1 = 1 / 4 - d := by dsimp [p]; ring
  have hw : 0 ≤ (1 - t) ^ a := Real.rpow_nonneg (sub_nonneg.mpr ht.2.le) _
  have hr : IntervalIntegrable (fun s : ℝ => (t - s) ^ p) volume 0 t := by
    simpa using (intervalIntegral.intervalIntegrable_rpow' (a := t) (b := 0) hp).comp_sub_left t
  have hpow : (∫ s in (0 : ℝ)..t, (t - s) ^ p) ≤ 1 / (1 / 4 - d) := by
    rw [intervalIntegral.integral_comp_sub_left (fun x : ℝ => x ^ p), sub_self, sub_zero,
      integral_rpow (Or.inl hp), he, Real.zero_rpow (by linarith : 1 / 4 - d ≠ 0), sub_zero]
    exact div_le_div_of_nonneg_right (Real.rpow_le_one ht.1 ht.2.le (by linarith)) (by linarith)
  calc
    _ ≤ (1 - t) ^ a * ∫ s in (0 : ℝ)..t, ‖F s‖ :=
      mul_le_mul_of_nonneg_left (intervalIntegral.norm_integral_le_integral_norm ht.1) hw
    _ = ∫ s in (0 : ℝ)..t, (1 - t) ^ a * ‖F s‖ :=
      (intervalIntegral.integral_const_mul _ _).symm
    _ ≤ ∫ s in (0 : ℝ)..t, M * (t - s) ^ p := by
      apply intervalIntegral.integral_mono_on_of_le_Ioo ht.1 (hF.norm.const_mul _) (hr.const_mul _)
      intro s hs
      have hlag := sub_pos.mpr hs.2
      calc
        _ ≤ (1 - t) ^ a * (M * (t - s) ^ (-(3 / 4 : ℝ)) * (1 - s) ^ (-(a + d))) :=
          mul_le_mul_of_nonneg_left (hbound s hs) hw
        _ = M * (t - s) ^ (-(3 / 4 : ℝ)) * ((1 - t) ^ a * (1 - s) ^ (-(a + d))) := by ring
        _ ≤ M * (t - s) ^ (-(3 / 4 : ℝ)) * (t - s) ^ (-d) :=
          mul_le_mul_of_nonneg_left (splitWeight hs.2 ht.2 ha hd)
            (mul_nonneg hM (Real.rpow_nonneg hlag.le _))
        _ = _ := by rw [mul_assoc, ← Real.rpow_add hlag]; rfl
    _ = M * ∫ s in (0 : ℝ)..t, (t - s) ^ p := intervalIntegral.integral_const_mul _ _
    _ ≤ M * (1 / (1 / 4 - d)) := mul_le_mul_of_nonneg_left hpow hM
    _ = _ := by ring

end WeightedDuhamel
