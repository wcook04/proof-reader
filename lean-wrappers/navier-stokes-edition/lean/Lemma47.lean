import SectionAnalysisDefinitions
import Breakdown.Transfer.VarConstIntegral
import WeightedDuhamel

open MeasureTheory Set Filter Topology
open NavierStokes.Analysis

noncomputable section
namespace NavierStokes

/-- The two weighted Duhamel estimates and the free heat estimate of Lemma 4.7. -/
def lemma_4_7_target : Prop :=
  ∀ κ CK : ℝ, 0 < κ → κ < (1 / 4 : ℝ) →
    ∃ C : ℝ, 0 ≤ C ∧
      ∀ (X : Type) [NormedAddCommGroup X] [NormedSpace ℝ X] [CompleteSpace X]
        (H : Breakdown.HeatBilinear X), H.CK = CK →
      (∀ v v' : ℝ → X, Analysis.WeightedCurve κ v → Analysis.WeightedCurve κ v' →
        Analysis.WeightedCurve κ (Analysis.duhamel H v v') ∧
        Analysis.weightedNorm κ (Analysis.duhamel H v v') ≤
          C * Analysis.weightedNorm κ v * Analysis.weightedNorm κ v') ∧
      (∀ χ : X, Analysis.WeightedCurve κ (fun t => H.G t χ) ∧
        Analysis.weightedNorm κ (fun t => H.G t χ) ≤ ‖χ‖) ∧
      ∀ f g : ℝ → X, ContinuousOn f (Ico 0 1) → BddAbove ((fun t => ‖f t‖) '' Ico 0 1) →
        Analysis.WeightedCurve 0 g → Analysis.WeightedCurve κ (Analysis.duhamel H f g) ∧
        Analysis.weightedNorm κ (Analysis.duhamel H f g) ≤
          C * sSup ((fun t => ‖f t‖) '' Ico 0 1) * Analysis.weightedNorm 0 g

namespace Lemma47

variable {X : Type} [NormedAddCommGroup X]

private theorem weightedRange {k : ℝ} {v : ℝ → X} (hv : WeightedCurve k v) :
    BddAbove ((fun t => (1 - t) ^ ((1 / 4 : ℝ) - k) * ‖v t‖) '' Ico (0 : ℝ) 1) := by
  obtain ⟨M, hM⟩ := hv.2
  exact ⟨M, by rintro _ ⟨s, hs, rfl⟩; exact hM s hs⟩

private theorem normAt {k s : ℝ} {v : ℝ → X} (hv : WeightedCurve k v)
    (hs : s ∈ Ico (0 : ℝ) 1) :
    ‖v s‖ ≤ weightedNorm k v * (1 - s) ^ (-((1 / 4 : ℝ) - k)) := by
  rw [Real.rpow_neg (by linarith [hs.2]), ← div_eq_mul_inv,
    le_div_iff₀ (Real.rpow_pos_of_pos (sub_pos.mpr hs.2) _), mul_comm]
  exact le_csSup (weightedRange hv) ⟨s, hs, rfl⟩

private theorem normNonneg {k : ℝ} {v : ℝ → X} (hv : WeightedCurve k v) :
    0 ≤ weightedNorm k v := by
  have h := normAt hv (s := 0) (by constructor <;> norm_num)
  simpa using (norm_nonneg _).trans h

private theorem assemble {k L : ℝ} {u : ℝ → X} (hc : ContinuousOn u (Ico 0 1))
    (hb : ∀ t ∈ Ico (0 : ℝ) 1, (1-t) ^ ((1 / 4 : ℝ) - k) * ‖u t‖ ≤ L) :
    WeightedCurve k u ∧ weightedNorm k u ≤ L := by
  refine ⟨⟨hc, L, hb⟩, csSup_le ?_ ?_⟩
  · exact ((Set.nonempty_Ico.mpr (by norm_num : (0 : ℝ) < 1)).image _)
  · rintro _ ⟨t, ht, rfl⟩
    exact hb t ht

variable [NormedSpace ℝ X] [CompleteSpace X]

private theorem bilinear (H : Breakdown.HeatBilinear X) {u v : ℝ → X} {a d i j U V : ℝ}
    (hu : ContinuousOn u (Ico 0 1)) (hv : ContinuousOn v (Ico 0 1))
    (ha : 0 ≤ a) (hd : 0 ≤ d) (hd' : d < 1 / 4) (hij : i + j = a + d)
    (hU : 0 ≤ U) (hV : 0 ≤ V)
    (hu' : ∀ s ∈ Ico (0 : ℝ) 1, ‖u s‖ ≤ U * (1-s) ^ (-i))
    (hv' : ∀ s ∈ Ico (0 : ℝ) 1, ‖v s‖ ≤ V * (1-s) ^ (-j)) :
    ContinuousOn (duhamel H u v) (Ico 0 1) ∧
      ∀ t ∈ Ico (0 : ℝ) 1, (1-t)^a * ‖duhamel H u v t‖ ≤ H.CK * U * V / (1/4-d) := by
  have localResult {b : ℝ} (hb : b ∈ Ico (0 : ℝ) 1) :=
    lemma_3_3 H u v 0 b hb.1 (hu.mono (fun _ hs => ⟨hs.1, hs.2.trans_lt hb.2⟩))
      (hv.mono (fun _ hs => ⟨hs.1, hs.2.trans_lt hb.2⟩))
  constructor
  · intro t ht
    obtain ⟨b, htb, hb⟩ := exists_between ht.2
    have hc := (localResult (b := b) ⟨ht.1.trans htb.le, hb⟩).2 t ⟨ht.1, htb.le⟩
    apply (continuousWithinAt_inter (t := Iio b) (Iio_mem_nhds htb)).mp
    exact hc.mono fun x hx => ⟨hx.1.1, hx.2.le⟩
  · intro t ht
    have hC := Breakdown.VarConstIntegralInternal.ck_nonneg H
    apply WeightedDuhamel.endpointEstimate ht ha hd hd' (by positivity)
      ((localResult ht).1 t ⟨ht.1, le_rfl⟩)
    intro s hs
    have hmem : s ∈ Ico (0 : ℝ) 1 := ⟨hs.1.le, hs.2.trans ht.2⟩
    have hlag := sub_pos.mpr hs.2
    have hK := H.K_bound (t-s) hlag (by linarith [ht.2, hs.1])
    calc
      _ ≤ ‖H.K (t-s)‖ * ‖u s‖ * ‖v s‖ := (H.K _).le_opNorm₂ _ _
      _ ≤ (H.CK * (t-s) ^ (-(3/4 : ℝ))) * (U * (1-s) ^ (-i)) * (V * (1-s) ^ (-j)) := by
        have hs₀ := sub_pos.mpr hmem.2
        exact mul_le_mul (mul_le_mul hK (hu' s hmem) (norm_nonneg _) (by positivity))
          (hv' s hmem) (norm_nonneg _) (by positivity)
      _ = _ := by
        rw [← hij, neg_add, Real.rpow_add (sub_pos.mpr hmem.2)]
        ring

/-- Lemma 4.7 with a constant uniform over the spaces and operators. -/
theorem weightedEstimates : NavierStokes.lemma_4_7_target := by
  intro k CK hk hk'
  let a := (1 / 4 : ℝ) - k
  have ha : 0 < a := sub_pos.mpr hk'
  let C := max (CK / k) (CK / a)
  refine ⟨max 0 C, le_max_left _ _, ?_⟩
  intro X _ _ _ H hCK
  have C₁ : H.CK / k ≤ max 0 C := hCK ▸ (le_max_left _ _).trans (le_max_right 0 C)
  have C₂ : H.CK / a ≤ max 0 C := hCK ▸ (le_max_right _ _).trans (le_max_right 0 C)
  refine ⟨?_, ?_, ?_⟩
  · intro u v hu hv
    obtain ⟨hc, hb⟩ := bilinear H (a := a) (d := a) hu.1 hv.1 ha.le ha.le
      (by dsimp [a]; linarith) (i := a) (j := a) rfl
      (normNonneg hu) (normNonneg hv) (fun _ => normAt hu) (fun _ => normAt hv)
    apply assemble hc
    intro t ht
    calc
      _ ≤ _ := hb t ht
      _ = H.CK / k * weightedNorm k u * weightedNorm k v := by
        rw [show (1 / 4 : ℝ) - a = k by dsimp [a]; ring]; ring
      _ ≤ _ := mul_le_mul_of_nonneg_right
        (mul_le_mul_of_nonneg_right C₁ (normNonneg hu)) (normNonneg hv)
  · intro χ
    apply assemble ((H.G_cont χ).mono (fun _ h => h.1))
    intro t ht
    calc
      _ ≤ 1 * (1 * ‖χ‖) := by
        apply mul_le_mul (Real.rpow_le_one (sub_nonneg.mpr ht.2.le) (by linarith [ht.1]) ha.le)
        · exact ((H.G t).le_opNorm χ).trans (mul_le_mul_of_nonneg_right (H.G_norm t ht.1) (norm_nonneg _))
        · exact norm_nonneg _
        · norm_num
      _ = _ := by ring
  · intro f g hf hf' hg
    let U := sSup ((fun t => ‖f t‖) '' Ico (0 : ℝ) 1)
    have hU (s : ℝ) (hs : s ∈ Ico (0 : ℝ) 1) : ‖f s‖ ≤ U := le_csSup hf' ⟨s, hs, rfl⟩
    have hU₀ := (norm_nonneg _).trans (hU 0 (by constructor <;> norm_num))
    obtain ⟨hc, hb⟩ := bilinear H (a := a) (d := k) hf hg.1 ha.le hk.le hk'
      (i := 0) (j := 1 / 4) (by dsimp [a]; ring) hU₀ (normNonneg hg)
      (by intro s hs; simpa using hU s hs) (by intro s hs; simpa using normAt hg hs)
    apply assemble hc
    intro t ht
    calc
      _ ≤ _ := hb t ht
      _ = H.CK / a * U * weightedNorm 0 g := by dsimp [a]; ring
      _ ≤ _ := mul_le_mul_of_nonneg_right
        (mul_le_mul_of_nonneg_right C₂ hU₀) (normNonneg hg)

end Lemma47
end NavierStokes
