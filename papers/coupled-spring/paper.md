# The minimum of the coupled spring potential

Completing the square writes the coupled spring potential
$U(x_0,x_1)=x_0^2+x_0x_1+x_1^2$ as

$$U(x)=\left(x_0+\tfrac12x_1\right)^2+\tfrac34x_1^2,$$

so $U$ is zero at the origin and positive everywhere else. In PhyslibAlpha,
Bjørn Kjos-Hanssen proves that the origin is a local minimum by a longer
route. He formalised a general second-derivative test in a companion file,
applied it to $U$, and describes the result as a proof of concept for the
test.

For this function every quantity the test uses can be computed by hand,
so the proof doubles as a worked example of the test. The sections below
follow it in order: what the test requires (§1) and how its proof turns a
positive Hessian into a minimum (§2). Then come a perturbed potential for
which the completed square no longer settles the question (§3) and a
hypothesis of the test's remainder lemma that its proof does not need (§4).
The last two sections derive $U$ from three springs and describe the
motion it governs.

## 1. What the test requires

**PhyslibAlpha theorem.** The coupled spring potential $U$ has a local minimum
at the origin. In symbols, $U(0)\le U(x)$ for all $x$ in some neighbourhood
of $0$.

Kjos-Hanssen derives it from the following test. Let $f$ be real-valued on a
finite-dimensional real inner product space. If $f$ is analytic at $a$, its
gradient vanishes at $a$, and $D^2f(a)[h,h]>0$ for every $h\ne0$, then $f$
has a local minimum at $a$.

For a quadratic, all three hypotheses can be read off a single expansion.
$U$ is a polynomial, so it is analytic at every point. Expanding $U(x+h)$
gives $U(x)+DU(x)[h]+U(h)$, where

$$DU(x)[h]=(2x_0+x_1)h_0+(x_0+2x_1)h_1.$$

The remainder is $U$ itself, evaluated at the increment. Its three-square
form, which §5 derives from the springs,

$$U(h)=\tfrac12\left(h_0^2+h_1^2+(h_0+h_1)^2\right),$$

together with $(h_0+h_1)^2\le2\lVert h\rVert^2$ gives
$0\le U(h)\le\tfrac32\lVert h\rVert^2$. So $U(h)/\lVert h\rVert$ tends to
zero with $h$, and the linear term is the derivative. Both of its
coefficients vanish at $x=0$, so the gradient at the origin is zero. The
coefficients are linear in $x$, so the Hessian is the same matrix at every
point.

$$K=\begin{pmatrix}2&1\\1&2\end{pmatrix}.$$

Putting the same vector in both slots of the second derivative gives back
twice the remainder.

$$h^{T}Kh=2U(h)=h_0^2+h_1^2+(h_0+h_1)^2.$$

The Hessian at the origin is positive definite. In fact
$h^{T}Kh\ge\lVert h\rVert^2$, with equality exactly when $h_0=-h_1$, where
the last square vanishes.

## 2. How the test turns a positive Hessian into a minimum

Write $Q(h)=D^2f(a)[h,h]$. Lean packages $Q$ as a quadratic map, so one
lower-bound lemma serves every positive-definite $Q$ of this form. On the
compact unit sphere the continuous function $Q$ is positive, so it attains a
positive minimum $C$ there, and scaling gives $Q(h)\ge C\lVert h\rVert^2$
for every $h$. A zero-dimensional space contains only the point $a$, and
Lean handles it separately.

At a critical point Taylor's theorem reads
$f(a+h)-f(a)=\tfrac12Q(h)+R(h)$, and the power-series lemma gives
$R(h)=o(\lVert h\rVert^2)$. So for each $\epsilon>0$ some neighbourhood of
$0$ has $|R(h)|\le\epsilon\lVert h\rVert^2$ throughout. Lean states this
as a little-o bound along the neighbourhood filter `nhds`, which lets the
proof fix $\epsilon$ first and take the neighbourhood afterwards. With
$\epsilon=C/2$ the remainder can cancel at most the quadratic lower bound,
so $f(a+h)\ge f(a)$ throughout that neighbourhood, which is Lean's
`IsLocalMin`. With $\epsilon=C/4$ the same estimate gives
$f(a+h)-f(a)\ge\tfrac14C\lVert h\rVert^2$, which is strict for $h\ne0$.

For $U$ every number in this argument is explicit. The minimum of $h^{T}Kh$
on the unit circle is the smaller eigenvalue of $K$, so $C=1$, attained at
$\pm(1,-1)/\sqrt2$. The remainder is identically zero, so the inequality
holds on the whole plane, although the test reports only a local minimum.

## 3. A remainder that matters

Now add a cubic and set $W(x)=U(x)+x_0^3$. The cubic has zero gradient and
zero Hessian at the origin, so $W$ has the same gradient and the same $K$
there, and $W$ is still a polynomial. A supplementary Lean proof applies
Kjos-Hanssen's analytic test to $W$ unchanged. Its only new step shows
that the second derivative of $x_0^3$ vanishes at the origin.

The remainder is now the cubic, and the numbers from §2 show how far the
conclusion reaches. Since $|x_0^3|\le|x_0|\,\lVert x\rVert^2$, the
$\epsilon=C/2$ bound holds wherever $|x_0|\le\tfrac12$ and the
$\epsilon=C/4$ bound wherever $|x_0|\le\tfrac14$. In the second region,
using $U(x)\ge\tfrac12\lVert x\rVert^2$,

$$W(x)\ge\tfrac14\lVert x\rVert^2,$$

so the origin is a strict local minimum. A second supplementary proof
checks the strict inequality near the origin in Lean.

On the $x_0$-axis the exact values are $W(t,0)=t^2(1+t)$. They are positive
for $-1<t<0$ and zero at $t=-1$, and they decrease without bound as $t$
decreases further. For example $W(-2,0)=-4<W(0)$, which Lean also checks,
so $W$ has no global minimum. On the negative half of this axis the
inequality $W\ge W(0)$ holds out to $t=-1$, twice as far as the region the
test guarantees. Given the zero gradient and analyticity, whether the
origin is a local minimum of $W$ is settled by $K$ alone, and the cubic
changes only the size of the neighbourhood.

## 4. A hypothesis the proof does not need

PhyslibAlpha's remainder lemma, `isLocalMin_of_posDef_of_littleo`, takes
the little-o estimate, the zero gradient and positive definiteness, and
also `ContDiffAt ℝ ⊤ f a`, smoothness of all orders at $a$. Its proof
obtains the lower bound $Q(h)\ge C\lVert h\rVert^2$ twice. The first call,
to `coercive_of_posdef`, uses only positive definiteness. The second, to
`coercive_of_posdef_of_contdiff`, uses smoothness and replaces the constant
from the first. The rest of the proof uses only the values $Q(h)$, and the
first call already bounds those.

Smoothness enters through a symmetry step. Write $B(u,v)=D^2f(a)[u,v]$, so
that $Q(h)=B(h,h)$. Expanding $B(u+v,u+v)$ gives the polar identity

$$Q(u+v)-Q(u)-Q(v)=B(u,v)+B(v,u).$$

If $B$ is symmetric, the right side is $2B(u,v)$, so half the polar form
recovers $B$ itself. PhyslibAlpha proves that symmetry from smoothness,
by Schwarz's theorem. On the diagonal the two terms are equal whether or not $B$ is
symmetric, and the minimum argument evaluates $B$ only on the diagonal.

A supplementary Lean proof keeps the little-o estimate, the zero gradient
and positive definiteness, drops the smoothness hypothesis, and reaches the
same conclusion with the first call alone.

At the pinned revision the only caller is the power-series test
`second_derivative_test`, which passes `h₁.analyticAt.contDiffAt` to the
remainder lemma. With the weaker lemma that argument could be removed, and
the public statements would stay as they are: the power-series test still
takes a power series and its analytic wrapper still takes analyticity. A
library change could also keep the original signature as a wrapper for
existing callers. The weaker lemma applies to any function whose Taylor
remainder is $o(\lVert h\rVert^2)$, including twice continuously
differentiable functions, which need not have a power series. A test for
that class would also need the remainder estimate, which is not formalised
here.

## 5. Where the three squares come from

Kjos-Hanssen's docstring calls $U$ the potential energy of a pair of
coupled springs. One mechanical model, chosen for this page, has two masses
on a line between fixed walls. A spring connects each mass to its wall,
and a third connects the masses. All three ideal springs have stiffness
$k>0$ and are at their natural lengths at the reference positions. Measure
$x_0$ and $x_1$ from those positions, with each positive direction pointing
inward.

![Two masses between fixed walls, joined by three springs of stiffness k. Positive x₀ points right and positive x₁ points left.](spring-coordinates.svg)

Moving the left mass inward by $x_0$ lengthens its wall spring by $x_0$,
and moving the right mass inward by $x_1$ lengthens the other wall spring by
$x_1$. Both inward motions shorten the middle spring, so its change in
length is $-(x_0+x_1)$. Each spring stores $\tfrac12k$ times the square of
its change in length, so the total is $kU(x)$, with one square for each
spring.

$$U(x)=\tfrac12\left(x_0^2+x_1^2+(x_0+x_1)^2\right).$$

For displacements in metres, $U$ is in square metres and $kU$ in joules.
Since $k>0$, multiplying by $k$ does not move the minimum. The wall springs
alone store $\tfrac12k\lVert x\rVert^2$, so $U(x)\ge\tfrac12\lVert x\rVert^2$,
the bound used for $W$ in §3, and the stored energy is zero only when both
masses are at their reference positions.

**Global minimum, supplementary proof.** For every nonzero $x\in\mathbb R^2$, $U(x)>U(0)$.
Both sides are zero at $x=0$. The Lean proof uses the completed square from
the introduction. If $\left(x_0+\tfrac12x_1\right)^2+\tfrac34x_1^2=0$, the
second term forces $x_1=0$. The first then forces $x_0=0$.

## 6. What the potential says about motion

In this model the force on each mass, measured along its own positive
direction, is $-k\,\partial U/\partial x_i$, so the force vector is
$-kKx$. For instance, move the left mass inward by $d>0$ and hold the right
one at its reference position. The compressed middle spring pushes the
right mass toward its wall, giving force $-kd$
in its own positive direction.

With equal masses $m>0$ and no damping, Newton's law gives
$m\ddot x=-kKx$. Displacements along the eigenvectors of $K$ keep their
shape, because $K(1,-1)^{T}=(1,-1)^{T}$ and $K(1,1)^{T}=3(1,1)^{T}$. Their
angular frequencies are $\omega_-=\sqrt{k/m}$ and $\omega_+=\sqrt{3k/m}$.
In the slow motion both masses move in the same physical direction and the
middle spring keeps its length. In the fast motion they move toward and
away from each other, and the middle spring adds to the restoring force.

The slow direction $(1,-1)$ is the direction in which the bound
$h^{T}Kh\ge\lVert h\rVert^2$ from §1 is an equality. So the constant $C=1$
from §2, multiplied by $k$, is the restoring stiffness of the slow motion,
and $m\omega_-^2=Ck$. The direction in which the test's lower bound is
weakest is the direction in which the system oscillates most slowly.

Any initial displacement and velocity can be resolved along these two
directions. If only the left mass is displaced, by $d$, and both masses are
released from rest, then $(d,0)=\tfrac d2(1,-1)+\tfrac d2(1,1)$, and the
mass that started at its reference position moves as

$$x_1(t)=\tfrac d2\left(\cos(\omega_+t)-\cos(\omega_-t)\right).$$

The two terms cancel at release and then drift apart because their
frequencies differ.

With unequal positive masses the same potential has the same equilibrium
and a different frequency problem. For a diagonal mass matrix $M$, the mode
equation is $kKv=\omega^2Mv$. Because the frequencies depend on $M$, the
potential on its own determines the equilibrium but no oscillation
frequency.

For the undamped model, taking the dot product of the equation of motion
with $\dot x$ shows that $\tfrac12m\lVert\dot x\rVert^2+kU(x)$ is constant.
This energy bounds $\tfrac12m\lVert\dot x\rVert^2+\tfrac12k\lVert x\rVert^2$
from above, so small initial displacements **and** velocities stay small.
The ideal equations extend to all of $\mathbb R^2$. The physical model
applies while the masses stay between their walls in their original order
and the springs obey Hooke's law.

## Sources and review

- Bjørn Kjos-Hanssen, [Coupled spring potential][physlib-u] and
  [Second-derivative test][physlib-test], PhyslibAlpha at commit `be0a9ee`.
- Matthew D. Schwartz, [Oscillators to Waves][schwartz], Harvard
  Physics 15c, §1. See also MIT OpenCourseWare,
  [Coupled Oscillators, Normal Modes][mit], for the superposition of modes.
- Schematic adapted from Jim.belk’s [Coupled Harmonic Oscillator k][figure],
  with inward displacement arrows and equal-stiffness labels.
  [CC BY-SA 3.0][figure-license].
- [Comparator receipt][comparator] for the original local-minimum theorem.
  Comparator accepted the Physlib proof against a challenge importing only
  Mathlib and rejected a control that asked for a local maximum.

AI agents wrote this companion under Will Cook’s direction. Lean checked
the two original modules and the supplementary proofs. Regression tests
check selected formulas against exact arithmetic and require matching
text in the Markdown. The prose, the passage links and the mechanical
interpretation await independent expert review.

[physlib-u]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/ClassicalMechanics/CoupledSpringPotential.lean
[physlib-test]: https://github.com/leanprover-community/physlib/blob/be0a9eef7dac78da524bfbde91c812340b194610/PhyslibAlpha/Mathematics/PartialDerivativeTest.lean
[schwartz]: https://schwartz.scholars.harvard.edu/sites/g/files/omnuum7046/files/schwartz/files/lecture4-oscillators-to-waves.pdf
[mit]: https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/pages/part-i-mechanical-vibrations-and-waves/lecture-4/
[figure]: https://commons.wikimedia.org/w/index.php?title=File:Coupled_Harmonic_Oscillator_k.svg&oldid=870225002
[figure-license]: https://creativecommons.org/licenses/by-sa/3.0/
[comparator]: https://github.com/wcook04/proof-reader/tree/f5f5e6f81251f766b0a705d46960e47e8b8a8962/papers/coupled-spring/comparator
