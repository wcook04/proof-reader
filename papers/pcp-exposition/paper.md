# Checking a long proof by reading a few bits

## An algebraic proof of the PCP theorem, through worked examples

*Explanatory reconstruction prepared by Will Cook with AI assistance · 16 November 2026.*

Algebraic construction: Amireddy, Behera, Srinivasan, Sudan and Willumsgaard. Lean formalization: Troy Lee.

<!-- passage:pcp-expository-opening -->
## Abstract

Every problem in NP has a randomised verifier that uses logarithmically
many random bits, reads a constant number of proof bits, always accepts
some proof of each true instance and rejects every proof of a false one
with probability at least one half. We explain the algebraic proof of this
PCP theorem by Amireddy, Behera, Srinivasan, Sudan and Willumsgaard, as
formalized in Lean by Troy Lee, through worked examples that follow one
colouring constraint down to the bits the verifier reads.

## Introduction

Suppose someone gives you a graph and claims that its vertices can be
coloured with three colours, with different colours at the ends of every
edge. By the PCP
theorem, a more redundant **proof**, the bit string the verifier queries,
can be checked by a randomised verifier reading only a constant number of
its bits. If the graph is three-colourable, some proof always passes.
Otherwise, every proof fails with probability at least one half.

The same holds for every decision problem whose answer is yes exactly
when some polynomial-length **witness** is accepted by a deterministic
polynomial-time algorithm. A polynomial bound is at most $C(n+1)^k$ for
fixed constants $C,k$, where $n$ is the input length; the verifier's
running time and the proof length have such bounds, and only the number
of proof bits read is constant. PCP stands for *probabilistically
checkable proof*.

The constant-query PCP theorem is due to Arora, Lund, Motwani, Sudan and
Szegedy [ALMSS98], building on Arora and Safra [AS98]. The construction
explained here, which combines polynomial identities with binary
encodings and avoids composition of PCP verifiers, is that of Amireddy,
Behera, Srinivasan, Sudan and Willumsgaard [ABSSW26, version 2]; the
formal proof in the proof assistant Lean, with explicit constants and
corrected test hypotheses, is Troy Lee's [Lee26]. These notes contribute
an explanation through small worked examples.

We assume polynomial arithmetic, finite sums and elementary probability,
and no complexity theory, coding theory or Lean. After an example
(Section 1) and the statement (Section 2), we develop polynomial
distance, the colouring equations, vanishing certificates, low-degree
tests and the Hadamard encoding in Sections 3 to 7. In Section 8 we combine the
encodings and follow one vertex condition of a two-vertex colouring to
the bits read; in Sections 9 and 10 we prove soundness and bound the
resources. Exercises, solutions and three appendices follow. The testing theorems are proved in the
[full argument][long]; the [specialist paper][short] is a shorter account.
<!-- /passage:pcp-expository-opening -->

<!-- passage:pcp-expository-colouring -->
## 1. Sampling the edges of a colouring

Consider the complete graph on four vertices, $K_4$. It has six edges and
cannot be three-coloured: among four vertices, two must have the same
colour, and those two are joined by an edge. Give its vertices the colours
$({\rm red},{\rm red},{\rm green},{\rm blue})$. Exactly one edge has equal
colours at its ends, so sampling one edge uniformly catches this failure
with probability $1/6$.

Now add $t$ disjoint triangles, each properly coloured. The graph is still
not three-colourable, because it still contains $K_4$, but the displayed
assignment has only one bad edge among $6+3t$ edges. Uniform edge sampling
rejects with probability

$$
\frac{1}{6+3t}.
$$

Three added triangles reduce this probability to $1/15$. For any fixed
number of uniform edge samples, the probability of finding the bad edge
tends to zero as $t$ grows.

The PCP verifier instead reads redundant tables related by algebraic
identities, and checks both that they encode low-degree polynomials and
that those polynomials satisfy the colouring conditions; tables passing often
enough will determine a proper colouring, which for $K_4$ is impossible.
<!-- /passage:pcp-expository-colouring -->

<!-- passage:pcp-expository-theorem -->
## 2. The PCP theorem

A decision problem is a set $\mathcal L$ of finite bit strings; a string
$x$ is a yes-instance when $x\in\mathcal L$. The class NP consists of
problems for which membership has a polynomial-length witness that a
deterministic polynomial-time algorithm can check [AB07, §2.1].
Three-colouring is one such problem.

**Theorem 2.1 (PCP theorem; [ALMSS98], [AS98]).** For every
$\mathcal L\in\mathrm{NP}$, there are a polynomial-time verifier $V$,
natural-number constants $\alpha,\beta,\ell$, and a polynomial $p$, such
that on every input $x$ of length $n$:

* $V$ uses exactly $\alpha\lceil\log_2(n+2)\rceil+\beta$ independent fair random bits;
* on every run it reads at most $\ell$ bits of a proof, all at positions
  below $p(n)$;
* if $x\in\mathcal L$, some proof is accepted for every choice of the random
  bits;
* if $x\notin\mathcal L$, every proof is accepted with probability at most
  $1/2$.

The verifier is one algorithm, fixed for $\mathcal L$ together with the
constants and polynomial. The proof may depend on $x$ and is fixed before
the random bits are chosen. A choice of those bits is a **random seed**.
Acceptance for every seed on a yes-instance is **perfect completeness**;
the bound $1/2$ on acceptance of a no-instance is the **soundness error**.

*Remark (formalization).* The count $\alpha\lceil\log_2(n+2)\rceil+\beta$
is the **exact randomness formula** of Lee's theorem; surplus bits may be
ignored, and the usual statement asks only for $O(\log n)$ bits. The
conditions above are those of the formal
[verifier definitions][verifier-definitions] and [main theorem][lean-theorem].

Conversely, suppose a problem has a verifier with these properties. Guess
the first $p(n)$ proof bits, and run the verifier on **all** its
random strings. There are

$$
2^{\alpha\lceil\log_2(n+2)\rceil+\beta}
\leq 2^{\alpha+\beta}(n+2)^\alpha
$$

random strings, polynomially many because $\alpha,\beta$ are fixed.
Accept the guessed bits if every run accepts. Perfect completeness
supplies such bits on yes-instances and soundness excludes them on
no-instances, all in polynomial time, so the problem is in NP. This
proves the equality

$$
\mathrm{NP}=\mathrm{PCP}(O(\log n),O(1)).
$$

The right-hand side is the class of problems with such a verifier, where
$O(\log n)$ means a bound by a fixed multiple of $\log n$ for all
sufficiently large $n$, and $O(1)$ a constant bound. We construct the
verifier for three-colouring and in Section 10 transfer it to every
problem in NP by a polynomial-time **reduction**, a translation of
inputs into graphs that preserves the answer.
<!-- /passage:pcp-expository-theorem -->

<!-- passage:pcp-expository-polynomial-distance -->
## 3. Polynomial distance and interpolation

First work in the field $\mathbb F_5=\{0,1,2,3,4\}$, with addition and
multiplication modulo $5$. Every nonzero element has a multiplicative
inverse; for example, $2^{-1}=3$ because $2\cdot3=1$ modulo $5$.

The polynomial $Z(X)=X(X-1)$ has the following values:

| $x$ | $0$ | $1$ | $2$ | $3$ | $4$ |
| :-------------------------------- | :-------- | :-------- | :-------- | :-------- | :-------- |
| $Z(x)$ | $0$ | $0$ | $2$ | $1$ | $2$ |

It vanishes at two points and is nonzero at three, as it must: a nonzero
polynomial of degree at most $d$ over a field has at most $d$ roots,
since each root permits a factor $(X-r)$ to be removed. Let $F$ be a
finite field with $q$ elements. By this root bound applied to their
difference, two different polynomials of degree at most $d$ over
$F$ disagree on at least a fraction $1-d/q$ of its elements. For
multivariate polynomials the corresponding bound uses **total degree**,
the largest sum of exponents in any nonzero monomial. For example, $X^2Y$
has total degree three, degree two in $X$, and degree one in $Y$.

**Lemma 3.1 (Schwartz–Zippel lemma; [ABSSW26, Theorem 2.5]).** If $P$ is
a nonzero polynomial over $F$ of total degree at most $d$ in $m$
variables and $u$ is uniform on $F^m$, then

$$
\Pr_{u\in F^m}[P(u)=0]\leq\frac dq.
$$

A proof by induction on $m$ is in the [full argument][long]. Thus a
uniform point detects a false polynomial identity, whose two sides differ
by a nonzero polynomial of total degree at most $d$, with probability at
least $1-d/q$.

The **relative Hamming distance**, or simply **distance**, between two
tables on the same finite domain is the fraction of entries on which they
disagree; a table is **$\delta$-close** to another when their distance is
at most $\delta$. An arbitrary table may differ from a polynomial at just
one entry, so a separate test is needed to establish closeness to a
low-degree polynomial before the lemma can be applied.
<!-- /passage:pcp-expository-polynomial-distance -->

<!-- passage:pcp-expository-interpolation -->
### The low-degree extension

A polynomial of degree at most two is determined by its values at three
distinct points. Over $\mathbb F_5$, its value at $3$ can be recovered
from the values at $0,1,2$ by

$$
p(3)=p(0)+2p(1)+3p(2).
$$

For $p(X)=X^2$, those three values are $0,1,4$, and the weighted sum is
$0+2+12=4$ modulo $5$, just as $3^2=4$ modulo $5$.
The coefficients are obtained from the Lagrange polynomials. For instance,
the coefficient of $p(0)$ is

$$
\frac{(3-1)(3-2)}{(0-1)(0-2)}=1
\quad\text{in }\mathbb F_5.
$$

Unit weights would give $0+1+4=0$, so the Lagrange weights are necessary
for this interpolation identity.

For a set $H$ of $h$ distinct field elements, let $\psi_s(X)$ be the
degree-$(h-1)$ polynomial equal to one at $s\in H$ and zero at the other
points of $H$:

$$
\psi_s(X)=\prod_{t\in H,\ t\ne s}\frac{X-t}{s-t}.
$$

The grid $H^m$ consists of $m$-tuples of elements of $H$. For $H=\{0,1\}$,
the one-variable basis polynomials are $\psi_0(X)=1-X$ and $\psi_1(X)=X$.
On the four-point grid $H^2$, the product $X(1-Y)$ is one at $(1,0)$
and zero at the other three points. Multiplying it by $f(1,0)$ contributes
exactly the entry at that point. Summing one such term per grid point gives
the general extension of a table $f:H^m\to F$:

$$
\widehat f(X_1,\ldots,X_m)
=\sum_{s\in H^m}f(s)\prod_{j=1}^m \psi_{s_j}(X_j).
$$

At each grid point, only its own basis product is nonzero. Thus
$\widehat f$, the **low-degree extension** of $f$ [ABSSW26, Fact 2.4],
agrees with $f$ on $H^m$, has degree at most $h-1$ in each coordinate,
and has total degree at most $m(h-1)$. For a colouring, the proof stores
this extension at every point of $F^m$.
<!-- /passage:pcp-expository-interpolation -->

<!-- passage:pcp-expository-colour-polynomials -->
## 4. Colourings as polynomial equations

For the colouring construction, use a field of **characteristic two**,
meaning $1+1=0$. Begin with the four elements $0,1,\omega,1+\omega$,
adding their binary coefficients modulo two and multiplying with the
rule $\omega^2=\omega+1$. These operations form the field
$\mathbb F_4$. Subtraction equals addition. For example,

$$
1-\omega=1+\omega=\omega^2,\qquad
\omega^3=\omega(\omega+1)=(\omega+1)+\omega=1.
$$

Every element has the form $a+b\omega$ with $a,b\in\{0,1\}$, so it
has binary coordinates $(a,b)$. Addition is coordinatewise. Multiplication
is also explicit:

$$
(a+b\omega)(c+d\omega)
=(ac+bd)+(ad+bc+bd)\omega.
$$

From now on $F$ is a field of characteristic two containing
$\mathbb F_4$; the full verifier works in such a field with $q$ much
larger than four. The three nonzero elements of $\mathbb F_4$ satisfy

$$
1^3=\omega^3=(\omega^2)^3=1.
$$

Use $1,\omega,\omega^2$ as the colours. A proposed value $u$ is one of
these colours exactly when $u^3-1=0$. If $u,v$ are valid colours,
they are different exactly when $(u-v)^3-1=0$. The residual values are:

| $(u-v)^3-1$ | $v=1$ | $v=\omega$ | $v=\omega^2$ |
| :-------------------------------- | :------------ | :------------ | :---------------- |
| $u=1$ | $1$ | $0$ | $0$ |
| $u=\omega$ | $0$ | $1$ | $0$ |
| $u=\omega^2$ | $0$ | $0$ | $1$ |

The vertex equation cannot be dropped. Assign all four elements of
$\mathbb F_4$, including zero, to the vertices of $K_4$. Every edge
difference is nonzero and has cube one, so every edge equation passes,
while the vertex assigned zero fails $u^3-1=0$.

Index the graph's vertices by a grid $H^m$, adding isolated vertices if
needed. Let $\chi$ be the low-degree extension of a colouring, and let
$\widehat E(x,y)$ be the low-degree extension of the adjacency function,
whose grid values are one for an edge and zero otherwise. Define

$$
\begin{aligned}
\operatorname{Val}(x)&=\chi(x)^3-1,\\
\operatorname{Prop}(x,y)&=\widehat E(x,y)
\bigl((\chi(x)-\chi(y))^3-1\bigr).
\end{aligned}
$$

Then $\chi$ describes a proper colouring precisely when
$\operatorname{Val}$ vanishes on $H^m$ and
$\operatorname{Prop}$ vanishes on $H^{2m}$. The adjacency factor makes
the second requirement automatic for nonedges.

We will follow the vertex condition for a graph consisting of one edge.
Index its ends by $H=\{0,1\}$ and give them colours $1,\omega$.
Their interpolating polynomial is

$$
\chi(X)=1+\omega^2X,
\qquad \chi(0)=1,\quad \chi(1)=\omega.
$$

Its vertex residual is

$$
P(X)=\chi(X)^3-1
=X^3+\omega X^2+\omega^2X
=(X^2+X)(X+\omega^2).
$$

A proper colouring requires $P$ to vanish only on the grid $\{0,1\}$; at
$x=\omega$, outside it, $\chi(\omega)=0$ and $P(\omega)=1$, yet the
verifier samples the whole field.
<!-- /passage:pcp-expository-colour-polynomials -->

<!-- passage:pcp-expository-grid-certificate -->
## 5. Vanishing certificates

In the one-edge example, $Z_H(X)=X^2+X$ vanishes precisely on
$H=\{0,1\}$, and $P(X)=Z_H(X)(X+\omega^2)$. More generally, by the
Combinatorial Nullstellensatz in the form of [ABSSW26, Lemma 2.9], every
polynomial vanishing on $H^m$ has a representation

$$
P(X)=\sum_{j=1}^m Z_H(X_j)Q_j(X),
\qquad Z_H(T)=\prod_{h\in H}(T-h).
$$

Each summand vanishes on the grid. Conversely, divide in each variable
by $Z_H$. The remainder has degree less than $h=|H|\geq1$
in every variable and is zero on $H^m$; repeated univariate interpolation
therefore makes it zero. Division can choose each nonzero quotient with
$\deg Q_j+h\leq\deg P$, since the divisor is monic of degree $h$.

Reading all $m$ terms would take a number of queries growing with $m$.
Following [ABSSW26, Corollary 2.10], package the sum into
a single polynomial of two groups of variables, the **vanishing
certificate** of $P$:

$$
M(X,U)=\sum_{j=1}^m U_jQ_j(X).
$$

Its degree is at most $\deg P$, because multiplication by $U_j$ adds
one to $\deg Q_j$ and $h\geq1$; this bound is used in Section 9.

It satisfies two polynomial identities,

$$
M(X,0)=0,
\qquad M(X,Z_H(X))=P(X),
$$

where $Z_H$ is applied to each coordinate. These identities also imply
the desired grid condition: if $x\in H^m$, then $Z_H(x)=0$, so both
expressions for $M$ give $P(x)=0$.

Our one-edge colouring gives

$$
M(X,U)=U(X+\omega^2),\qquad Z_H(\omega)=1.
$$

At $x=\omega$, the two identities read $M(\omega,0)=0$ and
$M(\omega,1)=1=P(\omega)$. The identities hold throughout the field,
even though $P(\omega)\ne0$. Both requested values are followed through
the binary encoding in Section 8.

If $P$ and $M$ have low degree and $P$ is nonzero somewhere on the grid,
one identity fails as a polynomial identity. By Lemma 3.1 a uniform
point then detects the failure, provided $q$ is large compared with the
degree, which substituting $Z_H(X_j)$ can multiply by $h$ (Section 9).

A table close to a polynomial may still be wrong at prescribed points.
Corrupting the row $F\times\{0\}$ in a table on $F^2$ changes only a
fraction $1/|F|$ of its entries, yet can corrupt every request of the
form $(x,0)$. The checks therefore need a procedure that recovers a
prescribed value through random table locations.
<!-- /passage:pcp-expository-grid-certificate -->

<!-- passage:pcp-expository-digit-encoding -->
## 6. Low-degree tests and the set-multilinear encoding

Let $f:F^m\to F$ be an arbitrary table of field values. For
$u,v\in F^m$ the **line through $u$ with slope $v$** is $z\mapsto u+zv$;
$v=0$ is allowed. The pair $(u,v)$ is the line's **index** and $u$ its
**base point**. A polynomial of total degree at most $d$ restricts to a
univariate polynomial of degree at most $d$ on each line. The proof supplies a
polynomial $T_{u,v}$ for each index $(u,v)$, and the
**point-versus-line test** (also called the line-point test) compares
$f(u+zv)$ with $T_{u,v}(z)$.

**Theorem 6.1 (point-versus-line test; [ALMSS98, Theorem 45],
cf. [ABSSW26, Theorem 2.12]).** Suppose every supplied line polynomial has
degree at most $d$. Sample $u,v\in F^m$ and $z\in F$ independently and
uniformly, including zero, and let $\delta$ be the rejection
probability of the comparison $f(u+zv)=T_{u,v}(z)$. If $q\geq10^6d^3$
and $\delta\leq1/(4\cdot10^6)$, then $f$ is $2\delta$-close to a
polynomial of total degree at most $d$.

No agreement between the supplied line polynomials is assumed. A
polynomial of the stated degree whose encoding is within the stated
distance of the received table is called a **nearby polynomial**; the
analysis chooses it, and the verifier never computes it.

*Remark (formalization).* This is Lee's whole-field version;
[ABSSW26, Theorem 2.12] samples $z\in F^\times$ and concludes distance
$4\delta$ with unspecified absolute constants.

We use Theorem 6.1 without proof; it is derived in the full argument
from agreement between row and column polynomials, through the [bivariate
agreement construction](../long/reasoning-record.md#45-bivariate-agreement)
and the [point-versus-line argument](../long/reasoning-record.md#46-the-point-versus-line-test). Reading the $d+1$ coefficients of a line polynomial is not
a constant number of bit queries when $d$ grows, so the construction
encodes the polynomial in more variables with a fixed degree.

For an example with two base-$3$ digits over $\mathbb F_5$, take

$$
p(Y)=Y^4+2Y+3.
$$

Since $4=1+1\cdot3$, $1=1+0\cdot3$ and $0=0+0\cdot3$, replace $Y^4$ by
$X_{0,1}X_{1,1}$, $Y$ by $X_{0,1}X_{1,0}$ and $1$ by $X_{0,0}X_{1,0}$:

$$
\widetilde p(X)=X_{0,1}X_{1,1}
 +2X_{0,1}X_{1,0}+3X_{0,0}X_{1,0}.
$$

It has degree two, with one group of variables for each digit position.
To recover $p(z)$, substitute

$$
(X_{0,0},X_{0,1},X_{0,2})=(1,z,z^2),
\qquad
(X_{1,0},X_{1,1},X_{1,2})=(1,z^3,z^6).
$$

At $z=2$, the triples are $(1,2,4)$ and $(1,3,4)$. The encoded
evaluation is $2\cdot3+2\cdot2+3=3$ modulo $5$, equal to
$p(2)=2^4+2\cdot2+3$. No quadratic in the original variable agrees
with $p$ at all five field elements: their difference would be a nonzero
polynomial of degree four with five roots.

For $j<b^c$, write $j$ with $c$ base-$b$ digits and replace $Y^j$
by the product of the corresponding $c$ variables. Each product uses
one variable from each digit group, so the encoded polynomial is
**set-multilinear** and has degree at most $c$; it is the
**set-multilinear encoding** of [ABSSW26, Definition 3.1]. The
construction fixes $c$ while allowing $b$ to grow. The evaluation identity
[ABSSW26, Claim 3.2] uses the substitution

$$
\Phi:F\longrightarrow F^{cb},\qquad
\Phi(z)_{i,j}=z^{jb^i}\quad(0\le i<c,\ 0\le j<b).
$$

For every $z\in F$, including $z=0$ (where the coordinates with $j=0$
equal one), $\widetilde p(\Phi(z))=p(z)$. In the one-digit case
$c=1,b=3$ used later, $\Phi(z)=(1,z,z^2)$.

A low-degree test checks only the degree bound $c$, so a table passing
it may be close to any polynomial of degree at most $c$, without the
set-multilinear form. Substitution still gives a univariate polynomial,
with a larger degree bound: each substituted variable has degree at most
$(b-1)b^{c-1}$, and a monomial of total degree at most $c$ has at most
$c$ variable occurrences, so the degree is at most $c(b-1)b^{c-1}$. We
use the upper bound $D=cb^c$.
<!-- /passage:pcp-expository-digit-encoding -->

<!-- passage:pcp-expository-weighted-test -->
### The standard low-degree test and local correction

A polynomial of degree at most $c$ is determined on a line by $c+1$
values. The nonzero elements of a finite field form a cyclic
multiplicative group [Shoup05, Theorem 9.16]: some element $\zeta$,
called a **generator**, has powers running through all of them. The
formal construction uses the nodes $a_i=\zeta^{i+1}$ for $i=0,\ldots,c$
and the Lagrange weights $\eta_i$ for evaluation at zero. The
**standard low-degree test** accepts when

$$
f(u)=\sum_{i=0}^c\eta_i f(u+a_i v)
$$

at uniformly random $u,v$. An honest polynomial of total degree at
most $c$ passes: along a line it is a univariate polynomial of degree
at most $c$, so interpolation applies.

**Theorem 6.2 (standard low-degree test; cf. [ABSSW26, Lemma 3.3]).** With
these generator nodes and $q>2c$, if the test rejects with probability
$\delta<1/[2(c+2)^2]$, then $f$ is $2\delta$-close to a polynomial of
total degree at most $c$.

*Remark (formalization).* The field-size condition $q>2c$ is Lee's.
[ABSSW26, Lemma 3.3] assumes characteristic two and a field size greater
than an unspecified absolute constant times $c^3$.

The same formula gives **local correction**, the recovery of a value at a
prescribed point, cf. [ABSSW26, Lemma 3.4], which also assumes $q>Cc^3$. Suppose $f$ differs from a
degree-$c$ polynomial $P$ on at most a fraction $\varepsilon$ of $F^m$.
Fix $u$, choose $v$ uniformly, and return the weighted sum of the $c+1$
values at $u+a_i v$, with no query at $u$ itself unless $v=0$. Each point
$u+a_i v$ is uniform:
since $a_i\ne0$, the inverse map is $y\mapsto a_i^{-1}(y-u)$. If all
sampled values are correct, interpolation returns $P(u)$. The points lie
on one line and need not be independent, but each individual error event
has probability at most $\varepsilon$, so the union bound gives error
probability at most

$$
(c+1)\varepsilon.
$$

Testing and correction now use a fixed number of
field queries; since each field value occupies several bits, a binary
encoding is needed to bound the number of bit queries.
<!-- /passage:pcp-expository-weighted-test -->

<!-- passage:pcp-expository-hadamard -->
## 7. The Hadamard encoding

Start with a three-bit message $s=101$. For every three-bit vector
$x$, store the parity

$$
h_s(x)=s\cdot x\pmod2.
$$

Until labels are defined below, $s$ denotes a message, $h_s$, $h$ and
$g$ words, and $r$ a vector. In the order
$000,001,010,011,100,101,110,111$ of positions, the word is

$$
(0,1,0,1,1,0,1,0).
$$

These positions are **homogeneous linear** labels: parity dot products
with no constant term. The eight answers form the **Walsh–Hadamard
encoding** of the three-bit message [AB07, §18.4.1]. Encodings of
distinct messages differ at exactly half the positions: their difference
is a nonzero **linear functional**, a map $x\mapsto s'\cdot x$ with
$s'\ne0$, and translation by a vector on which it
is one pairs each zero with a one. Querying the same uniform homogeneous
label on two encodings therefore detects unequal messages with
probability $1/2$.

The **BLR linearity test** of Blum, Luby and Rubinfeld [BLR93] checks
whether an arbitrary **word**, a function from labels to bits, is such an
encoding. Choose independent uniform $a,b$ and check

$$
h(a)+h(b)=h(a+b),
$$

with additions modulo two. An honest word always passes. Flip the entry
at $001$ in our eight-bit word to obtain $g$.
Of the $64$ ordered pairs $(a,b)$, $46$ pass and $18$ fail. To count the
rejections, track whether an odd number of $a,b,a+b$ equals $001$. The
three relevant sets each have eight pairs; their pairwise intersections
are the three distinct pairs $(001,001)$, $(001,000)$ and $(000,001)$,
in each of which two errors cancel. The count is therefore
$3\cdot8-2\cdot3=18$.

**Theorem 7.1 (BLR linearity test; [BCHKS96, Theorem 1.2],
[ABSSW26, Theorem B.1]).** If the BLR linearity test rejects a word with
probability $\varepsilon$, the word is $\varepsilon$-close to a linear
functional.
<!-- /passage:pcp-expository-hadamard -->

<!-- passage:pcp-expository-hadamard-correction -->
### Self-correction

Suppose we want $h_s(x)$ but distrust the entry at $x$. Choose a uniform
$r$ and return

$$
g(r)+g(r+x).
$$

This two-query read is **self-correction** [BLR93], [AB07, §18.4.1].
For the honest word it equals $h_s(x)$, because the two appearances of
$h_s(r)$ cancel. If $g$ has error fraction $\varepsilon$, a wrong answer
requires an error at $r$ or at $r+x$. Each is uniform, so the error
probability is at most $2\varepsilon$.

In our word with one corrupted position, $\varepsilon=1/8$. For each
nonzero $x$, exactly six of the eight choices of $r$ give the correct
answer, so the bound $2\varepsilon=1/4$ is attained.
<!-- /passage:pcp-expository-hadamard-correction -->

<!-- passage:pcp-expository-cubic-labels -->
### Labels of degree three

In a field $F$ of size $q=2^t$, a binary basis is a list of $t$
elements expressing each field element uniquely as a sum with
coefficients in $\{0,1\}$; in $\mathbb F_4$, $u=a+b\omega$ has
coordinates $(a,b)$ in the basis $(1,\omega)$. Write $\rho(u)$ for the
$t$ coordinates. The colouring identities need observations of
expressions such as $u^3-1$.

Precisely, a **label** is a multilinear polynomial over $\mathbb F_2$ in $t$
variables $Z_1,\ldots,Z_t$ of degree at most $r$; the **degree-$r$ Hadamard encoding** of
$u$ [ABSSW26, Definition 3.5] stores $R(\rho(u))$ at label $R$. Since
Boolean variables satisfy $Z_i^2=Z_i$ on evaluation, multilinear
monomials, in which no variable is repeated, suffice. The verifier uses $r=3$:

$$
\mathcal H_3(u)(R)=R(\rho(u)).
$$

For fixed $u$ the word is linear in the label $R$, although $R$ may be
cubic in the coordinates. We write $R(u)$ for $R(\rho(u))$. **Affine** labels have
degree at most one, constants included; **homogeneous** labels are the linear
labels without constant term; all labels of degree at most $r$ are the **full**
labels. For $t=3$ there are $8$ homogeneous linear labels, $16$ affine
labels, used later for the certificates and line restrictions, and
$2^8=256$ full labels of degree at most three, used for $\chi$ and $\chi'$.

Each binary coordinate of a field product is a sum of products of
coordinates of its two factors. Thus a homogeneous observation
$L(u^3-1)$ is a polynomial of degree at most three in $\rho(u)$, and the
verifier obtains it by querying one position of $\mathcal H_3(u)$.

In our four-element field, the product formula of Section 4 gives $u^2=(a+b)+b\omega$, then

$$
u^3-1=(1+a+b+ab)+0\omega.
$$

For the observation $L(a+b\omega)=a$, the requested label is therefore

$$
\Lambda=1+Z_1+Z_2+Z_1Z_2.
$$

For $u=\omega$, the coordinates $(0,1)$ give $1+0+1+0=0$, as required.
Since squaring is binary-linear in characteristic two, $L(u^3-1)$ in fact
has degree at most two; we keep Lee's degree-three labels and his query
count.

Linearity in the labels does not show that a word encodes a field
element. Assign one to $1$ and $Z_1Z_2$, zero to $Z_1,Z_2$, and extend
linearly on their span. No point has these evaluations: $Z_1=Z_2=0$
forces $Z_1Z_2=0$. Encodings satisfy $\mathcal H_3(u)(1)=1$ and
$\mathcal H_3(u)(Z_1Z_2)=\mathcal H_3(u)(Z_1)\mathcal H_3(u)(Z_2)$,
and the false word violates the product identity.

**Theorem 7.2 (Hadamard test; cf. [ABSSW26, Lemma 3.10]).** Consider a word
on all full labels of degree at most $r\geq1$ in $t$ variables. The
**Hadamard test** runs the BLR linearity test and, using self-corrected
answers, checks preservation of one and products of an affine factor with
a factor of degree at most $j$, for each $1\leq j<r$; it also compares
the direct answer at a uniform affine label with its self-correction. If
the test rejects with probability $\delta<1/28$, there is one message
whose encoding is $\delta$-close to the word on full labels and
$3\delta$-close on affine labels. The
[Hadamard soundness proof](../long/reasoning-record.md#53-the-hadamard-test)
for Lee's test is in the full argument.

*Remark (formalization).* The threshold $1/28$ is Lee's; [ABSSW26,
Lemma 3.10] assumes $\delta$ below an unspecified constant. Lee's
degree-three Hadamard test reads ten bits; their test HadTest reads
eight, retaining only the top-degree product check. We use Lee's count.

When a field value is stored as a word at each point $x$, write $w_x$
for the word received at $x$. Its requested label $\Lambda_{x,L}$ may be
corrupt even when $w_x$ has small average error. Self-correction on the
full labels returns the **self-corrected read**

$$
w_x(R)+w_x(R+\Lambda_{x,L}),
$$

where the **fresh random label** $R$ is uniform and independent of the
fixed $x,L$. Both queried labels are uniform, though the requested label
need not be. If $w_x$ has error fraction $\varepsilon_x$, the union
bound gives answer error at most $2\varepsilon_x$ without independence
between the reads, and averaging over uniform $x$ gives $2\varepsilon$
when the average error is $\varepsilon$.
<!-- /passage:pcp-expository-cubic-labels -->

<!-- passage:pcp-expository-proof-inventory -->
## 8. The proof tables, binary tests and local correction

### The stored proof

The proof consists of eight **tables**, which [ABSSW26] call proof
oracles: four **points tables** and four **lines tables**. The points
table of a polynomial $P$ on $F^k$ stores at each point $x$ the Hadamard
encoding of $P(x)$. Its **lines table** assigns to each index
$(u,v)\in F^k\times F^k$ the restriction $z\mapsto P(u+zv)$, stored after
the set-multilinear encoding and then the Hadamard encoding with affine
labels. The four polynomials are:

| Polynomial | What it records | Labels |
| :------------ | :--------------------------------------- | :--------------------- |
| $\chi(x)$ | Low-degree extension of the colouring | Degree at most three |
| $\chi'(x,y)$ | Difference $\chi(x)-\chi(y)$ | Degree at most three |
| $M_V(x,u)$ | Vanishing certificate of $\operatorname{Val}$ | Affine |
| $M_E(x,y,u,v)$ | Vanishing certificate of $\operatorname{Prop}$ | Affine |

An **honest proof** contains these tables for a proper colouring and its
certificates; a received proof may contain arbitrary bits. Lee's
formalization writes $P,Q_P,A_P,B_P,E,M_A,M_B$ for
$\chi,\chi',\operatorname{Val},\operatorname{Prop},\widehat E,M_V,M_E$.

<!-- /passage:pcp-expository-proof-inventory -->

<!-- passage:pcp-expository-binary-tests -->
The two kinds of table have the following addresses.

| Table | Address | Stored bit |
| :----------------- | :------------------------------------ | :--------------------------- |
| Points table $f$ | Point $x\in F^k$, label $R$ | $R$ of the value at $x$ |
| Lines table $f'$ | Index $(u,v)\in F^k\times F^k$, inner point $\xi\in F^{cb}$, affine label $R$ | $R$ of the encoded line restriction at $\xi$ |

At a fixed point $x$ the points table holds the word $w_x$. At a fixed
index $(u,v)$ the lines table holds the **encoded entry** $f'_{u,v}$,
indexed by an **inner point** $\xi$, the argument of the set-multilinear
encoding, and an affine label. In an honest entry, $\xi=\Phi(z)$ gives
the labelled bit of the original line value at $z$.

*Remark (formalization).* Lee uses affine labels for all four lines
tables. [ABSSW26, §7] uses degree-three labels for the colour and
difference lines tables.

The **inner low-degree test** acts on one encoded entry: a fair coin
chooses between the Hadamard test at a uniform inner point and a one-bit
observation of the standard low-degree test of Section 6. The
**binary low-degree test** samples $u,v\in F^k$ and $z\in F$
independently and uniformly, zero included. It runs the Hadamard test on
the word $w_u$, runs the inner low-degree test on $f'_{u,v}$, and
compares the points-table bit at $(u+zv,L)$ with a self-corrected
lines-table answer at $(\Phi(z),L)$, for an independent uniform
homogeneous label $L$. All three checks must pass.

*Remark (formalization).* In [ABSSW26, Algorithm 5] the inner low-degree test runs
both components; Lee's fair coin runs one.

The field weights of the interpolation formula do not require reading a
whole field element. For a homogeneous label $L$ and a field weight
$\eta$,

$$
L(\eta u)=(L\circ(\eta\cdot))(u).
$$

For example, $\omega(a+b\omega)=b+(a+b)\omega$. If $L$ reads the
first coordinate, $L(\omega u)=b$, so the weighted query asks for the
second coordinate of $u$: the weight is incorporated into the label.
Applying $L$ to a weighted field identity gives an identity among a fixed
number of bits, and a uniform homogeneous label detects a false field
identity with probability $1/2$.

The analysis needs **one** nearby polynomial whose encoding is close to
the points table both on its full labels (affine labels, for the
certificate tables) and on the homogeneous labels. A small error on the
full labels can conceal a large homogeneous error: in the encoding of
$(1,0,1)$ on the 256 full labels of Section 7, substitute the answers for
$(1,0,0)$ at the eight homogeneous positions. Four answers change, so the
full-label error is $4/256=1/64$ while the homogeneous-label error is
$4/8=1/2$.

Fix positive integers $c,b$ and put $D=cb^c$. Constants $J,S,C$ depend
only on $c$: $J$ bounds field-valued line error, $S$ converts rejection
to encoding distance, and $C$ bounds the correction-failure contribution
from rejection. Their [formulas](#the-error-constants) are in Appendix A.

**Theorem 8.1 (binary low-degree test; cf. [ABSSW26, Theorem 4.1]).** With
the generator nodes of Section 6, if the binary low-degree test
rejects with probability at most $\kappa$ and

$$
q\geq10^6D^3,
\qquad J\kappa\leq\frac1{4\cdot10^6},
$$

then there is one polynomial of degree at most $D$ whose encoding is
within $\varepsilon=S\kappa$ of the received points table on both
full and homogeneous labels. Each distance averages over the point of
$F^k$ and the specified label domain.

*Remark (formalization).* Lee samples $z$ from all of $F$ and concludes
closeness on homogeneous labels with explicit constants, derived in the
[full argument][long]; the second guarantee of [ABSSW26, Theorem 4.1]
concerns all affine labels.

The binary low-degree test averages over base points and slopes, but a
local corrector requesting the value at $a\in F^k$ uses only entries with
base point $a$. These form a fraction $q^{-k}$ of the lines table, yet
they include every entry this corrector can select, and all of them
could be corrupt (Exercise 7). Randomising the
slope leaves the base point fixed, so the corrector tests its selected
entry again, and the rejection rate of that test enters the bound.

At a fixed target $a\in F^k$, the **local corrector** runs the following
experiment.

1. Independently choose a uniform slope $v\in F^k$, a uniform nonzero
   $z\in F^\times$, a uniform homogeneous label $L$, a uniform inner
   slope $e\in F^{cb}$ and an independent seed for the inner low-degree
   test.
2. Run the inner low-degree test on the entry for the line $a+Yv$.
   Reject if it fails.
3. Correct that entry at $\Phi(z)$ and compare the bit with the
   points-table answer at $(a+zv,L)$. Reject if they differ.
4. Otherwise return its correction at $\Phi(0)$, using the same inner
   slope and label.

The output is rejection or one bit; honest tables of a polynomial $P$ of
degree strictly below $b^c$ return $L(P(a))$ for every seed.

**Theorem 8.2 (local correction; cf. [ABSSW26, Theorem 5.1]).**
Let $q>2c$, with the generator nodes of Section 6.
Suppose the points table has homogeneous distance at most $\delta$ from
a polynomial $P$ of degree at most $D$, and the local corrector at $a$
rejects with probability $\kappa_a$. Then

$$
\Pr[\text{rejection or wrong returned bit}]
\leq C \kappa_a+\delta+\frac{D}{2(q-1)}.
$$

*Remark (formalization).* Lee assumes closeness only on homogeneous
labels and gives the explicit constant $C$; [ABSSW26, Theorem 5.1]
assumes closeness on all affine labels and bounds the failure by an
$O_c(\cdot)$ term.

The probability averages over a uniform homogeneous label; it is not a
bound for each fixed label, and no assumption on the lines table or on
$\kappa_a$ is needed. For the three terms, choose a nearby line
polynomial for each tested entry. The inner low-degree test bounds each entry's
encoding distance by a constant times its rejection rate, and averaging
over slopes bounds the resulting correction errors by a constant times
$\kappa_a$. If a chosen
line polynomial has the wrong value at zero, its difference from
$P(a+Yv)$ is a nonzero polynomial of degree at most $D$, with at most $D$
roots among the $q-1$ nonzero comparison points. A uniform homogeneous
label distinguishes unequal field values with probability $1/2$, giving
the term $D/[2(q-1)]$. Finally, for nonzero $z$ the point $a+zv$ is
uniform, so replacing its points-table answer costs at most $\delta$.

Return to the two identities for the vanishing certificate:

$$
M(x,0)=0,
\qquad M(x,Z_H(x))=P(x).
$$

The **zero-on-grid test**, cf. [ABSSW26, Theorem 6.1], written ZERO there,
chooses a uniform point $x$ and homogeneous label $L$, obtains a
constraint bit $p(x,L)$, and calls the local corrector of the certificate
tables at $(x,0)$ and $(x,Z_H(x))$ with this $L$ and independent
remaining seeds. It accepts when the calls return $b_0=0$ and
$b_Z=p(x,L)$, and rejects if either call rejects, so its rejection rate
bounds each correction's rejection *averaged over its requested targets*,
though not for every fixed target.

*Remark (formalization).* In [ABSSW26, Algorithm 7] the two corrector
calls share one seed; Lee's calls have independent seeds.

For colouring, the constraint bit $p(x,L)$ is a self-corrected read of
the colour table (vertex check) or difference table (edge check), with
the public adjacency value incorporated into the edge label. Honest
encodings and their certificates pass for every seed. The **ideal test**
reads the values of the nearby polynomials in place of the received
answers; a failed grid condition forces it to reject through Lemma 3.1,
and the cost of the replacement is bounded in Section 9.
<!-- /passage:pcp-expository-binary-tests -->

<!-- passage:pcp-expository-worked-zero -->
### The one-edge vanishing certificate in bits

Return to $P(X)=\chi(X)^3-1$, $M(X,U)=U(X+\omega^2)$ and $x=\omega$.
Take the homogeneous label $L$ with $L(a+b\omega)=a$. The desired bit is
$L(P(\omega))=1$, obtained from
$\Lambda=1+Z_1+Z_2+Z_1Z_2$. With fresh random label $R=Z_1$, the two
colour-table reads are

| Address | Bit of the honest word, where $\chi(\omega)=0$ |
| :------------------- | -----------------------------------------------------: |
| $(\omega,Z_1)$ | $0$ |
| $(\omega,1+Z_2+Z_1Z_2)$ | $1$ |

Their sum is the required bit; on honest data every choice of $R$ gives
it.

The certificate targets are $A=(\omega,0)$ and $B=(\omega,1)$.
Consider a run where both independently chosen slopes equal
$v=(1,1)$ and both nonzero comparison parameters equal $z=1$.
The honest line restrictions are

$$
p_A(Y)=M(\omega+Y,Y)=Y^2+Y,\qquad
p_B(Y)=M(\omega+Y,1+Y)=Y^2+1.
$$

Both have value zero at the comparison parameter $1$. Thus the
points-table comparison reads at $((\omega^2,1),L)$ and $((\omega^2,0),L)$ both return zero.
At the target parameter $0$, the desired answers are zero and one.

Take $b=3,c=1$. The set-multilinear encodings are
$\widetilde p_A(W)=W_2+W_1$ and $\widetilde p_B(W)=W_2+W_0$.
With $\Phi(z)=(1,z,z^2)$ they recover $p_A(z),p_B(z)$.
The generator nodes $\omega,\omega^2$ have weights $\omega^2,\omega$,
so an affine inner polynomial $T$ satisfies

$$
T(\xi)=\omega^2T(\xi+\omega e)+\omega T(\xi+\omega^2e).
$$

Take the inner slope $e=(0,1,0)$ in each call. For $u=a+b\omega$ the
weights become bit labels: $L(\omega^2u)=a+b$ and $L(\omega u)=b$. The
table lists the eight correction reads. Each call also runs the inner
low-degree test, which chooses by a fair coin between the Hadamard test
and the standard low-degree test; those test reads are omitted. Each
address includes its call's base point $A$ or $B$ and slope $v$; the
labelled columns specify the inner point and label.

| Call | Step | $z$ | Point for $Z_1+Z_2$ | Bit | Point for $Z_2$ | Bit | Sum |
| :------ | :---------- | ---: | :---------------------- | ----: | :------------------ | ----: | ----: |
| $A$ | Compare | $1$ | $(1,\omega^2,1)$ | $1$ | $(1,\omega,1)$ | $1$ | $0$ |
| $A$ | Return | $0$ | $(1,\omega,0)$ | $1$ | $(1,\omega^2,0)$ | $1$ | $0$ |
| $B$ | Compare | $1$ | $(1,\omega^2,1)$ | $0$ | $(1,\omega,1)$ | $0$ | $0$ |
| $B$ | Return | $0$ | $(1,\omega,0)$ | $1$ | $(1,\omega^2,0)$ | $0$ | $1$ |

The comparison bits agree with the two points-table reads. The inner
low-degree tests pass on honest data, and the calls return
$b_0=0,b_Z=1$. The zero-on-grid test accepts because $b_0=0$ and
$b_Z=1=p(\omega,L)$.

The two calls' remaining seeds are independent given $x,L$; the
displayed run has equal outcomes. The small field and $c=1$ do not satisfy
the parameter conditions of the $c=4$ verifier.
<!-- /passage:pcp-expository-worked-zero -->

<!-- passage:pcp-expository-assembly -->
## 9. Soundness of the seven-check verifier

The verifier runs seven checks on the eight tables listed in Section 8:
four binary low-degree tests, two zero-on-grid tests for the colouring
conditions, and a difference check connecting $\chi'$ to $\chi$. It
accepts only if all seven pass.

![Which of the eight stored tables each of the seven checks may query. A dot marks table use. LDT denotes a binary low-degree test. The shaded column, the vertex zero-on-grid test, is the branch illustrated in Section 8.](table-checks.png)

The local correctors use the lines tables of the low-degree tests. The
edge zero-on-grid test also uses the adjacency polynomial, computed from
the input graph and not stored in the proof.

The separate difference table lets the verifier query cubic labels of a
claimed difference value with the same operations as for the colour
table. The difference check ties it to $\chi(x)-\chi(y)$: at independent
uniform points and one uniform homogeneous label, it reads the stored
bits of the three values and checks that the bit for $\chi'$ is the sum
of the other two.

For perfect completeness, interpolate a proper colouring, form its
difference polynomial, construct both vanishing certificates, and supply
their encodings and lines tables. All seven checks then pass for every
seed, given the degree-capacity condition $5m(h-1)<b^c$ verified in
Appendix A.

For soundness, fix an arbitrary proof and let $\kappa$ be the seven-check
verifier's rejection rate, so that each check rejects with probability at
most $\kappa$. We choose a positive constant $g$, independent of the
graph size, such that $\kappa<g$ implies a proper colouring; every proof
for a non-three-colourable graph is then rejected with probability at
least $g$. The four binary low-degree tests give four nearby polynomials,
and the difference check with Lemma 3.1 forces the nearby $\chi'$ to
equal $\chi(x)-\chi(y)$. The zero-on-grid tests then force
$\operatorname{Val}_{\chi}=\chi^3-1$ and
$\operatorname{Prop}_{\chi'}=\widehat E((\chi')^3-1)$ to vanish on
their grids, for the same nearby $\chi,\chi'$, so $\chi$ gives a valid
colour at every vertex and distinct colours across each edge.

### The soundness gap

Suppose $J\kappa\leq1/(4\cdot10^6)$. Each low-degree test rejects with
probability at most $\kappa$, so Theorem 8.1 gives the distance bounds
$\varepsilon=S\kappa$. Replacing the three bits of the difference check
by the values of the nearby polynomials changes its decision with
probability at most $3\varepsilon$, while unequal difference polynomials
would force ideal rejection at least $(1-D/q)/2$. Hence

$$
\kappa+3\varepsilon<\frac{1-D/q}{2}
$$

forces the exact difference identity.

The parameters ensure $m(h-1)\leq D$, so the adjacency extension has
degree at most $2D$. The nearby colour polynomial has degree at most $D$,
so its vertex constraint has degree at most $3D$ and its edge constraint,
including the adjacency factor, at most $5D$. The certificate polynomials
also have degree at most $D$. If either constraint fails
to vanish on its grid, the zero-on-grid soundness estimate gives

$$
\frac{1-5Dh/q}{2}
\leq (1+2C)(\kappa+2\varepsilon)
       +2\varepsilon+\frac{5D}{q-1}.
$$

Replace the self-corrected constraint bit $p(x,L)$ by its ideal value, keep both actual
certificate corrections, and let $r$ be the resulting rejection rate. Self-correction with a fresh random label gives
$r\leq\kappa+2\varepsilon$. Rejection by either correction still
rejects this modified test, so each correction's target-averaged
rejection is at most $r$, and by Theorem 8.2 its failure probability is
at most $Cr+\varepsilon+5D/[2(q-1)]$.

Couple the ideal and modified tests through the same random choices; if
the ideal test rejects but the modified one accepts, a correction
supplied a wrong bit. Therefore

$$
\begin{aligned}
\Pr[\text{ideal rejects}]
&\le r+\Pr[\text{a correction fails}]\\
&\le r+2\left(Cr+\varepsilon+\frac{5D}{2(q-1)}\right)\\
&\le(1+2C)(\kappa+2\varepsilon)+2\varepsilon+\frac{5D}{q-1}.
\end{aligned}
$$

A false grid condition makes one residual a nonzero polynomial of
degree at most $5Dh$. It is nonzero on at least a fraction
$1-5Dh/q$ of the points. A uniform homogeneous label detects
each nonzero value with probability $1/2$, giving the ideal lower
bound. No independence between the two residual checks is needed.

Choose the field large enough that

$$
\frac Dq\leq\frac14,\qquad
\frac{5Dh}{q}\leq\frac14,\qquad
\frac{5D}{q-1}\leq\frac18.
$$

Both ideal lower bounds are then at least $3/8$. Since $J,S,C$ are
constants, a fixed positive $g$ makes $\kappa<g$ imply the testing
threshold and

$$
\kappa+3S\kappa<\frac1{16},\qquad
(1+2C)(\kappa+2S\kappa)+2S\kappa<\frac1{16}.
$$

The difference identity follows since $1/16<3/8$. A false grid
condition would require
$3/8\leq\Pr[\text{ideal rejects}]<1/16+1/8=3/16$, a contradiction.
Thus both grid conditions hold; parameters meeting all the field-size
conditions at once are given in Appendix A.
<!-- /passage:pcp-expository-assembly -->

<!-- passage:pcp-expository-resources -->
## 10. Randomness, proof length and repetition

In the [parameter calculation](#parameter-calculation) we fix $c=4$ and
choose the grid dimension and digit base $s$ and the number $t$ of
binary coordinates so that the grid holds all $N$ vertices, the
field-size bounds of Section 9 hold, and a point address ($O(st)$ bits)
and a full label ($O(t^3)$ bits) both take $O(\log N)$ bits. So does
every address and seed, and the $2^{O(\log N)}=N^{O(1)}$ possible
addresses give polynomial proof length. Fair random bits give uniform
field elements directly, since $|F|$ is a power of two; the exception is
the nonzero comparison parameter needed by each of the four corrector
calls in the two zero-on-grid tests.

*Remark (formalization).* Lee's verifier samples each of these four
parameters from the whole field and accepts if any is zero. Conditioned
on all four being nonzero, the distribution is the original one, so the
rejection probability is multiplied by $(1-1/|F|)^4\geq1/16$ and a
positive gap survives. Lee also implements the field, arithmetic,
adjacency extension, queries and acceptance predicate in polynomial time
on a concrete machine model; this proof is in the [full argument][long].

One unamplified run reads at most 187 bits at $c=4$, but its proved
rejection probability on a false proof is small, so the verifier runs
a fixed number of times on the same proof with independent seeds. If
each run accepts a fixed false proof with probability at most $3/4$,
three runs all accept with probability at most

$$
(3/4)^3=27/64<1/2.
$$

The probabilities multiply because the proof is fixed and the seeds are
independent. In general, if each run rejects with probability at least
$\gamma\in(0,1)$, then $R$ independent runs (here $R$ counts repetitions) all accept
with probability at most $(1-\gamma)^R$, and $R\gamma\geq1$ implies
$(1-\gamma)^R\leq1/2$: indeed,
$(1-\gamma)^{-1}\geq1+\gamma$ and
$(1+\gamma)^R\geq1+R\gamma$, so
$(1-\gamma)^R\leq1/(1+R\gamma)\leq1/2$.
Since $R$ is fixed, repetition preserves constant queries and
logarithmic randomness. The count for each check, the proved gap and the
repetition count are in [Appendix A](#parameter-calculation).

### Reduction from NP to three-colouring

The standard Cook–Levin construction expresses an accepting computation
by local constraints [AB07, §2.3]. Write the computation of an NP
witness checker as a table, with one row per time step holding the
machine's state, head position and memory. Polynomial time gives polynomially many
rows and cells. Constraints prescribe the input and a permitted witness,
legal transitions, and final acceptance. The machine has a fixed finite
alphabet and reads a fixed number of symbols per transition, so each
constraint involves boundedly many finite choices. All constraints hold
exactly when the table describes an accepting computation with some
witness.

An explicit polynomial-time reduction turns these fixed-arity constraints
into **clauses**, ORs of at most three bits or negated bits, then into
a graph. The first conversion is proved in the [full clause construction](../long/reasoning-record.md#310-the-reduction-from-np-to-three-colourability);
its finite-pattern method is illustrated by the [calculation in Appendix B](#clauses-for-a-finite-relation),
where the colouring gadget is also checked. The graph is three-colourable exactly when the
constraints are simultaneously satisfiable, that is, exactly when the
input has an accepted witness. Its polynomial output length converts the graph
verifier's $O(\log N)$ randomness into $O(\log n)$ randomness.
Composing the reduction with that verifier proves the forward inclusion
in Section 2; exhaustive seed checking proved the reverse inclusion.

<!-- /passage:pcp-expository-resources -->

<!-- passage:pcp-expository-answers -->
## 11. Exercises

**Exercise 1 (Section 5).** Could the verifier omit the first identity
and test only $M(X,Z_H(X))=P(X)$? Test your answer with the nonvanishing
polynomial $P=1$.

**Exercise 2 (Section 7).** Why would choosing $r=x$ deterministically
fail to give the same guarantee against an arbitrary corrupt word? Which
property of the random choice was used in the proof?

**Exercise 3 (Section 9).** Suppose the analysis of the low-degree tests
supplied one nearby polynomial for the cubic labels of the colour table
and a different one for its homogeneous linear labels. Which step of the
soundness argument would need repair?

**Exercise 4 (Section 2).** If the verifier were allowed to use
$\sqrt n$ random bits instead, would the exhaustive-seed
argument still prove that its language is in NP?
Identify the step that changes.

**Exercise 5 (Section 9).** In a hypothetical estimate of the kind used
in Section 9, a false grid condition makes an ideal test reject with
probability at least $3/8$. The actual test rejects with
probability at most $\kappa$, and replacing its answers by ideal answers
changes the verdict with probability at most $4\kappa+1/16$. Does
$\kappa\leq1/32$ rule out a false grid condition? Does
$\kappa\leq1/16$ do so by the same estimates? Explain what follows
at the boundary.

**Exercise 6 (Section 7).** Corrupt only the zero label in the encoding
on the 256 full labels. Draw a uniform label $U$ and use it both as the
requested label and as the fresh random label. Both are uniform
individually. Does the $2/256$ correction bound still follow? Compare
this with a fixed nonzero request and an independent fresh label.

**Exercise 7 (Section 8).** Corrupt all lines-table entries with one
fixed base point in $\mathbb F_4^2$. What are the global and conditional
fractions of bad entries? Which step protects the local corrector at that
base point?

**Exercise 8 (reconstruction).** Assume the parameter and rejection
bounds of Section 9, and fix the nearby certificate polynomial $M$ from
that argument. Its received table is close to $M$, but the erroneous
entries may be concentrated at points $(x,0)$. Why can direct reads there
not establish $M(x,0)=0$? Reconstruct the repair using line data,
correction with possible rejection, and the final polynomial-identity
argument. Explain why every step concerns the same $M$.

## 12. Solutions

**Solution 1.** No. Take $P=1$ and $M(X,U)=1$: then $M(X,Z_H(X))=P(X)$
holds everywhere although $P$ never vanishes. The first identity excludes
this choice; with both, substituting a grid point forces
$P(x)=M(x,0)=0$.

**Solution 2.** For nonzero $x$, with $r=x$ fixed, the answer uses only
the entries at $x$ and zero, and a corrupt word can put an error at one
of precisely those positions; a small global error fraction does not make
either fixed position reliable. The random choice made both query
locations uniform, and the union bound then converted global error
fractions into a bound on this particular request.

**Solution 3.** The difference check would constrain the polynomial
chosen for the homogeneous labels and the zero-on-grid test a different
one chosen for the degree-three labels, so no single colouring polynomial
would be known to satisfy both the difference identity and the grid
conditions.

**Solution 4.** The $2^{\sqrt n}$ seeds are not bounded by any fixed
polynomial in $n$, so exhaustive verification could take more than
polynomial time. The argument fails; this does not prove that the
language is outside NP.

**Solution 5.** Ideal rejection is at most actual rejection plus the
probability that the verdict changes, hence at most $5\kappa+1/16$. At
$\kappa\leq1/32$ this is at most $7/32<12/32=3/8$, contradicting a false
grid condition. At $\kappa\leq1/16$ the upper bound is $3/8$, and
equality gives no contradiction: the estimates neither certify grid
vanishing nor demonstrate its failure. The strict bound $\kappa<1/16$
would suffice.

**Solution 6.** The translated query $U+U$ is always the zero label, so
except when $U=0$ exactly one of the two reads is corrupt: the error is
$255/256$. For a fixed nonzero request and an independent fresh label,
exactly two choices cause error, giving $2/256$. Uniformity must hold
after fixing the request.

**Solution 7.** Of $16\cdot16=256$ line indices, 16 have the chosen base
point: the global fraction is $1/16$, but among entries the corrector can
select it is one. Retesting the selected entry puts its rejection rate
into Theorem 8.2, whose bound allows rejection or a wrong answer.

**Solution 8.** Use the same polynomial $M$ throughout. At $(x,0)$, the
local corrector tests the encoded entry of a random line through the
target, compares a corrected answer at a random nonzero parameter with
the points-table answer, and rejects or returns the corrected bit at the
origin; Theorem 8.2 bounds rejection or a wrong bit relative to $M$.

The zero-on-grid test rejects whenever either correction rejects, so each
correction's target-averaged rejection is bounded by the test's rejection
rate. The ideal checks on $M$ can reject only when the actual test
rejects or an answer replacement fails. If $M(X,0)$ were a nonzero
polynomial, the Schwartz–Zippel lemma and a uniform homogeneous label
would force ideal rejection above the error budget assumed from
Section 9. Hence $M(X,0)=0$ as a polynomial identity. The second identity
must be established for the same $M$ and the same nearby constraint
polynomial.
<!-- /passage:pcp-expository-answers -->

<!-- passage:pcp-expository-parameters -->
## Appendix A. Parameters and error bounds

### Parameter calculation

For a graph with $N\geq2$ vertices, choose the least integer $\nu\geq2$
such that $\lceil\log_2 N\rceil\leq \nu2^\nu$. Put

$$
s=2^\nu,\qquad |H|=m=s,\qquad c=4,\qquad
|F|=2^{12\nu+32}=2^{32}s^{12}.
$$

The grid $H^m$ contains $s^s=2^{\nu2^\nu}$ points, enough for
the vertices. Minimality of $\nu$ gives $\nu2^\nu=O(\log N)$:
if $\nu>2$, the preceding value $(\nu-1)2^{\nu-1}$ was too small,
and $\nu2^\nu\leq4(\nu-1)2^{\nu-1}$. The boundary value $\nu=2$
adds only a constant. The formal definition also covers
$N=0,1$ by taking $\nu=2$.

A point of $F^m$ takes $m\log_2|F|=s(12\nu+32)=O(\log N)$ bits, and
the encoded line data uses $cs=4s$ further field coordinates.

A degree-three label specifies one bit per multilinear monomial, using
$1+t+\binom t2+\binom t3$ bits for $t=12\nu+32$. This is $O(\nu^3)$,
and $\nu^3=O(\nu2^\nu)$ since $\nu^2=O(2^\nu)$. Every address and seed
therefore has $O(\log N)$ bits.

The set-multilinear encoding uses base $b=s$ and degree $c=4$, so
the substitution estimate in Section 6 gives $D=cb^c=4s^4$.
The honest colour and certificate polynomials have degree at
most $5m(h-1)=5s(s-1)$. Since $s\geq4$,

$$
5s(s-1)<s^4=b^c,
$$

so all their line restrictions fit the honest encoding capacity. The
field is large enough for the testing bounds:
$10^6D^3=64\,000\,000s^{12}\leq2^{32}s^{12}=|F|$.
Also $100Dh=400s^5\leq|F|$. This bounds $D/q$ by $1/100$
and $5Dh/q$ by $1/20$; it also gives $q-1\geq40D$, hence
$5D/(q-1)\leq1/8$. All three field conditions in Section 9
therefore hold for the same choice of parameters.

At $c=4$ the seven checks read at most $26,22,26,22,44,44$ and $3$
bits: the binary low-degree tests on the colour, vertex-certificate,
difference and edge-certificate tables, the vertex and edge zero-on-grid
tests, and the difference check. Their sum, 187, bounds one unamplified
run; some seeds read fewer bits. For the implemented verifier, fair-bit
sampling leaves rejection probability at least
$\gamma=1/1137847282503168$ on every proof of a no-instance. The fixed
repetition count $R=1137847282503168$ satisfies $R\gamma=1$. The
repetition count is too large for practical verification; these bounds
establish existence.
<!-- /passage:pcp-expository-parameters -->

<!-- passage:pcp-expository-error-constants -->
### The error constants

The constants used in Sections 8 and 9 depend only on the fixed inner
degree $c$:

$$
\begin{aligned}
K&=4(c+2)^2\bigl(112(c+2)+60\bigr),\\
J&=2\bigl((c+1)K+29\bigr),\qquad S=28+J,\\
C&=2+2(c+1)K.
\end{aligned}
$$

Here $K$ bounds the inner-test distance; $J,S,C$ have the roles given in
Section 8. Their derivation is in the [full correction argument](../long/reasoning-record.md#56-local-correction-with-a-lines-table).
<!-- /passage:pcp-expository-error-constants -->

<!-- passage:pcp-expository-colouring-gadget -->
## Appendix B. The Boolean-to-colouring gadget

Boolean values are $0$ and $1$; $a\lor b$ is their OR, and $\neg a$
is the opposite bit. Write $\operatorname{NAE}(a,b,c)$ when the three
values are **not all equal**. The clause $a\lor b\lor c$ holds exactly
when there is a bit $z$ satisfying

$$
\operatorname{NAE}(a,b,z),\qquad
\operatorname{NAE}(\neg z,c,0).
$$

If $a=b=0$, the first relation forces $z=1$, and the
second then forces $c=1$. If $a=b=1$, choose $z=0$;
if $a\ne b$, the same choice works regardless of $c$.

Make a palette triangle with colours named $0,1,2$, represented by
$1,\omega,\omega^2$ in the field encoding. For each Boolean variable,
add adjacent vertices for it and its negation, both joined to palette
vertex $2$; they must receive opposite colours $0,1$. A literal uses
its variable or negation vertex, and constant false uses palette vertex
$0$. For each NAE relation on literal vertices $a,b,c$, add vertices
$A,B,C$ and the six edges

$$
\{AB,BC,CA,Aa,Bb,Cc\}.
$$

The first three edges form a triangle; the last three connect its vertices
to the corresponding literals. If all literal colours are equal,
the new triangle has only two colours available and
cannot be coloured. For literal colours $(0,0,1)$,
the new triangle can use $(1,2,0)$ respectively:
its colours are distinct, and each differs from
its adjacent literal. Permuting and complementing
the literal colours covers every other NAE case.

<!-- /passage:pcp-expository-colouring-gadget -->

<!-- passage:pcp-expository-clause-calculation -->
### Clauses for a finite relation

The formal reduction represents a finite choice by a block of bits with
exactly one bit equal to one. For a relation $R:\{0,1\}^k\to\{0,1\}$,
where $k$ is fixed, introduce a fresh sequence of flags for each pattern
$p\in\{0,1\}^k$. Here $\mathrm{xor}$ means addition modulo two:

$$
z_0=0,\qquad z_{i+1}=z_i\lor(x_i\mathbin{\mathrm{xor}}p_i),
\qquad R(p)\lor z_k=1.
$$

The flags record whether the input has differed from $p$. The final
condition permits input $p$ only if $R(p)=1$. Since $p_i$ is fixed,
$x_i\mathbin{\mathrm{xor}}p_i$ is either $x_i$ or its negation.
An OR equation $z=u\lor v$ is enforced by three clauses:

$$
(z\lor\neg u),\qquad(z\lor\neg v),\qquad
(\neg z\lor u\lor v).
$$

The first two require $z=1$ if either input is one;
the third requires an input to be one if $z=1$.
Short clauses are padded with the constant false.
Enumerating $2^k$ patterns costs a constant depending
on the original machine because $k$ is fixed, so the
output remains polynomial in size.
<!-- /passage:pcp-expository-clause-calculation -->

<!-- passage:pcp-expository-correction -->
## Appendix C. The version-1 test

Version 1 of [ABSSW26] used unit weights in the same identity, with an
element of order $c+1$ as node [ABSSW26v1, Fact 2.7, Lemma 3.3]; Lee
showed that this **version-1 test** accepts $X^4$. For $c=2$, let
$\zeta$ have order three in a field $F$ of characteristic two. The
version-1 condition is

$$
f(u)=f(u+\zeta v)+f(u+\zeta^2v)+f(u+v).
$$

It holds for quadratic polynomials, but the converse fails for
$f(X)=X^4$. In characteristic two,
$(u+av)^4=u^4+a^4v^4$. Since $\zeta^4=\zeta$
and $1+\zeta+\zeta^2=0$, the right-hand side is

$$
3u^4+(\zeta+\zeta^2+1)v^4=u^4.
$$

The test accepts every pair $(u,v)$, although $X^4$ disagrees with every
quadratic on at least a fraction $1-4/|F|$ of $F$, since their difference
is a nonzero polynomial of degree four. The fields
$F=\mathbb F_{2^{2k}}$ for $k\geq2$ contain elements of order three and
have unbounded size, so no fixed field-size threshold repairs the
version-1 test at degree two.

For a concrete comparison, take
$\mathbb F_{16}=\mathbb F_2[t]/(t^4+t+1)$.
Here $t$ is a polynomial variable; the elements are binary polynomials
in $t$ of degree below four, added coefficientwise modulo two and
multiplied with the reduction $t^4=t+1$. The modulus is irreducible: it has no binary root, and its remainder
modulo the only monic irreducible binary quadratic, $t^2+t+1$, is one.
A reducible quartic without a linear factor would have a quadratic
factor. Thus these 16 elements form a field.
The version-1 nodes of order three accept $X^4$ on all
$256$ pairs $(u,v)$. The standard low-degree test, with the generator $t$
of order 15 and interpolation weights at $t,t^2,t^3$, accepts only $16$
pairs; its completeness follows from interpolation and its soundness from
Theorem 6.2. Troy Lee found the error in [ABSSW26v1, Lemma 3.3], as
acknowledged in [ABSSW26]; no priority claim for the example is made here.
<!-- /passage:pcp-expository-correction -->

<!-- passage:pcp-expository-evidence -->
## Formalization and sources

The construction is due to Amireddy, Behera, Srinivasan, Sudan and
Willumsgaard [ABSSW26]. [Troy Lee's formal development][lean-project]
[Lee26] contains the algebraic verifier and the concrete complexity
proof. Its endpoints are the [forward theorem][lean-theorem], stated
with the formal [verifier definitions][verifier-definitions], the
[reverse inclusion][lean-reverse] for a concrete machine model, and the
[agreement of its NP class with a reference definition][lean-reference-np].
Lee's variants of statements in [ABSSW26], each noted in a remark, are:
the exact randomness formula (Theorem 2.1); whole-field sampling
(Theorems 6.1 and 8.1, Section 10); the hypothesis $q>2c$
(Theorem 6.2); ten Hadamard-test queries (Theorem 7.2); affine labels on
every lines table, a fair coin in the inner low-degree test and independent
corrector seeds in the zero-on-grid test (Section 8); the
homogeneous conclusion of Theorem 8.1 and hypothesis of Theorem 8.2; and explicit constants
(Appendix A). The
formalization also contains the Fourier-analytic proof of Theorem 7.1.
Lee identified the error in the version-1 test, as acknowledged in
[ABSSW26]. Lee's
[reading guide][troy-guide] introduces the main Lean statement, and
[AB07, Chapter 18] is a textbook account.

Statements, source correspondences and proofs of the testing theorems
are in the [full argument][long].
A Lean theorem establishes its own formal statement; agreement with this
exposition is a separate comparison. The finite calculations were
checked by computer: the order 15 of $t$ in $\mathbb F_{16}$, the cases
of Appendix C and the interpolation identity with the
[finite-field checker][example-checker], and the identities and
addresses of the one-edge example with the [trace checker][trace-checker].
The unbounded-family argument in Appendix C is an ordinary mathematical
deduction and is not formalized.

## References

**[AB07]** S. Arora and B. Barak. *Computational Complexity: A Modern
Approach*. [Draft of January 2007][arora-barak]; section numbers refer to
this draft, which numbers its PCP definition differently from the
published edition.

**[ABSSW26]** P. Amireddy, A. R. Behera, S. Srinivasan, M. Sudan and
S. V. Willumsgaard. *A Simple Algebraic Proof of the PCP Theorem*.
[arXiv:2608.17429v2][paper-v2], October 2026.

**[ABSSW26v1]** The same, [version 1][paper-v1].

**[ALMSS98]** S. Arora, C. Lund, R. Motwani, M. Sudan and M. Szegedy.
Proof verification and the hardness of approximation problems. *J. ACM*
**45**(3), 1998. [Manuscript][almss].

**[AS98]** S. Arora and S. Safra. Probabilistic checking of proofs: a new
characterization of NP. *J. ACM* **45**(1), 70–122, 1998.
[Journal text][arora-safra].

**[BCHKS96]** M. Bellare, D. Coppersmith, J. Håstad, M. Kiwi and
M. Sudan. Linearity testing in characteristic two. *IEEE Trans. Inform.
Theory* **42**(6), 1781–1795, 1996. [Manuscript][bchks].

**[BLR93]** M. Blum, M. Luby and R. Rubinfeld. Self-testing/correcting
with applications to numerical problems. *J. Comput. System Sci.*
**47**(3), 549–595, 1993. [DOI][blr].

**[Lee26]** T. Lee. *tcs-formalizations: PCP development*. Lean source,
2026. [Pinned revision][lean-project].

**[Shoup05]** V. Shoup. *A Computational Introduction to Number Theory
and Algebra*. Cambridge University Press, 2005. [Version 1][shoup].
<!-- /passage:pcp-expository-evidence -->

[paper-v2]: https://arxiv.org/abs/2608.17429v2
[arora-safra]: https://www.cs.umd.edu/~gasarch/TOPICS/pcp/AS.pdf
[almss]: https://people.seas.harvard.edu/~madhusudan/papers/1992/almss-journ.pdf
[arora-barak]: https://theory.cs.princeton.edu/complexity/book.pdf
[blr]: https://doi.org/10.1016/0022-0000(93)90044-W
[lean-project]: https://github.com/troyjlee/tcs-formalizations/tree/a0ce13ed0fa264f051c1278e039596ce65557fa4/PCP
[lean-theorem]: https://github.com/troyjlee/tcs-formalizations/blob/a0ce13ed0fa264f051c1278e039596ce65557fa4/PCP/Theorem.lean
[verifier-definitions]: https://github.com/troyjlee/tcs-formalizations/blob/a0ce13ed0fa264f051c1278e039596ce65557fa4/PCP/Verifier/Definition.lean
[troy-guide]: https://wcook04.github.io/proof-reader/#/pcp-reading-guide
[long]: ../long/reasoning-record.md
[short]: ../short/paper.md
[paper-v1]: https://arxiv.org/abs/2608.17429v1
[shoup]: https://shoup.net/ntb/ntb-v1.pdf
[lean-reverse]: https://github.com/troyjlee/tcs-formalizations/blob/a0ce13ed0fa264f051c1278e039596ce65557fa4/PCP/ReverseConcrete.lean#L33-L39
[lean-reference-np]: https://github.com/troyjlee/tcs-formalizations/blob/a0ce13ed0fa264f051c1278e039596ce65557fa4/PCP/Complexity/ReferenceNPConverse.lean#L39-L41

[bchks]: https://www.csc.kth.se/tcs/projects/publications/bchks.pdf

[example-checker]: https://github.com/wcook04/lean-exposition/blob/f992ebd7fb9f16f921ec05c4c3f93f33ad933ad6/papers/pcp/expository/check_examples.py

[trace-checker]: https://github.com/wcook04/lean-exposition/blob/e4f60e1d0b1a857074c9d9aa869a1c375e95920d/papers/pcp/expository/check_trace.py
