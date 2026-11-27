import Theorem11Challenge
import Breakdown.CertTorus.PressureSumSecondPartials
import Breakdown.CertTorus.PressureSourceDivDiv

open scoped ContDiff
open Breakdown Breakdown.FarField
open Lean Meta Elab Term
noncomputable section
namespace ProfileDecay

/-- Specialize the original divergence calculation to the local PDE hypotheses it uses.
Lean's kernel checks the specialized proof against its new type. -/
local elab "unbundle_divergence " src:ident : term => do
  let .thmInfo source ← getConstInfo (← realizeGlobalConstNoOverloadWithInfo src)
    | throwError "expected a theorem"
  lambdaTelescope source.value fun args proof => do
    unless args.size == 7 do throwError "unexpected divergence theorem signature"
    let orbit := args[4]!
    let names := #[``IsSmoothOrbitField.smooth_field, ``IsSmoothOrbitField.smooth_pressure,
      ``IsSmoothOrbitField.residual, ``IsSmoothOrbitField.divergence]
    -- Instantiate only the projections actually occurring in the pinned proof.
    let fields ← names.mapM fun name => mkAppM name #[orbit]
    let used := fields.filter fun e => (proof.find? (· == e)).isSome
    let decls ← used.mapM fun e => do pure (e.getAppFn.constName!, ← inferType e)
    withLocalDeclsDND decls fun hypotheses => do
      let body := proof.replace fun node => (used.idxOf? node).map fun i => hypotheses[i]!
      if body.containsFVar orbit.fvarId! then throwError "additional profile hypothesis used"
      mkLambdaFVars (#[args[0]!, args[1]!] ++ hypotheses ++ #[args[5]!, args[6]!]) body

variable {W : Theorem11.Velocity} {q : Theorem11.Pressure}
  {P A : ℝ} {R : Space ≃ₗᵢ[ℝ] Space}

theorem paperPressureLaplacian (h : Theorem11.IsPaperProfile W q P R A) (s : ℝ) (x : Space) :
    FundSol.scalarSumSecondPartials (q s) x = -pressureSource W s x := by
  obtain ⟨_, hw, hq, he, hd, _⟩ := h
  exact (unbundle_divergence pressureLaplacian_holds) W q hw hq he hd s x

theorem paperPressureDivDiv (h : Theorem11.IsPaperProfile W q P R A) (s : ℝ) (x : Space) :
    pressureSource W s x = divDivSource (pairTensor W W s) x := by
  obtain ⟨_, hw, _, _, hd, _⟩ := h
  exact (unbundle_divergence pressureSourceDivDiv_holds) W q hw hd s x

end ProfileDecay
