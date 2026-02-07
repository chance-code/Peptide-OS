/**
 * Statistical Utilities — Phase 3B
 *
 * Shared math primitives for:
 * - Bayesian Online Changepoint Detection (BOCD)
 * - Gaussian Process Lab Forecasting
 * - N-of-1 Causal Inference (OLS via Cholesky)
 *
 * Pure functions, no external dependencies.
 */

// ============================================================
// Student-t Distribution (for BOCD conjugate predictive)
// ============================================================

/** Log of the gamma function (Stirling approximation for large values, Lanczos for small) */
function lnGamma(x: number): number {
  if (x <= 0) return Infinity;
  // Lanczos approximation (g=7)
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Log PDF of Student-t distribution.
 * Used by BOCD for conjugate Normal-Inverse-Gamma predictive.
 */
export function studentTLogPDF(x: number, mu: number, sigma: number, nu: number): number {
  if (sigma <= 0 || nu <= 0) return -Infinity;
  const z = (x - mu) / sigma;
  return (
    lnGamma((nu + 1) / 2) -
    lnGamma(nu / 2) -
    0.5 * Math.log(nu * Math.PI) -
    Math.log(sigma) -
    ((nu + 1) / 2) * Math.log(1 + (z * z) / nu)
  );
}

// ============================================================
// Cholesky Decomposition (for GP and OLS regression)
// ============================================================

/**
 * Cholesky decomposition A = L L^T.
 * Adds jitter to diagonal for numerical stability.
 * Returns null if matrix is not positive-definite even with max jitter.
 */
export function choleskyDecompose(A: number[][]): number[][] | null {
  const n = A.length;

  for (const jitter of [0, 1e-6, 1e-5, 1e-4, 1e-3]) {
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    let success = true;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        if (i === j) {
          const diag = A[i][i] + jitter - sum;
          if (diag <= 0) {
            success = false;
            break;
          }
          L[i][j] = Math.sqrt(diag);
        } else {
          L[i][j] = (A[i][j] - sum) / L[j][j];
        }
      }
      if (!success) break;
    }

    if (success) return L;
  }

  return null;
}

/**
 * Solve L L^T x = b given Cholesky factor L.
 * Forward substitution (L y = b) then back substitution (L^T x = y).
 */
export function choleskySolve(L: number[][], b: number[]): number[] {
  const n = L.length;

  // Forward: L y = b
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) {
      sum += L[i][j] * y[j];
    }
    y[i] = (b[i] - sum) / L[i][i];
  }

  // Back: L^T x = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += L[j][i] * x[j];
    }
    x[i] = (y[i] - sum) / L[i][i];
  }

  return x;
}

/** Log determinant of A given its Cholesky factor L: log|A| = 2 * Σ log(L_ii) */
export function choleskyLogDeterminant(L: number[][]): number {
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    sum += Math.log(L[i][i]);
  }
  return 2 * sum;
}

// ============================================================
// Matrix Utilities
// ============================================================

export function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < p; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

export function matrixTranspose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const T = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export function identityMatrix(n: number): number[][] {
  const I = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

// ============================================================
// GP Kernel Functions
// ============================================================

/** Squared Exponential (RBF) kernel */
export function rbfKernel(x1: number, x2: number, lengthscale: number, variance: number): number {
  const d = x1 - x2;
  return variance * Math.exp(-0.5 * (d * d) / (lengthscale * lengthscale));
}

/** Matern 3/2 kernel */
export function matern32Kernel(x1: number, x2: number, lengthscale: number, variance: number): number {
  const r = Math.abs(x1 - x2) / lengthscale;
  const sqrt3r = Math.sqrt(3) * r;
  return variance * (1 + sqrt3r) * Math.exp(-sqrt3r);
}

/** Matern 5/2 kernel */
export function matern52Kernel(x1: number, x2: number, lengthscale: number, variance: number): number {
  const r = Math.abs(x1 - x2) / lengthscale;
  const sqrt5r = Math.sqrt(5) * r;
  return variance * (1 + sqrt5r + (5 * r * r) / 3) * Math.exp(-sqrt5r);
}

/** Periodic kernel */
export function periodicKernel(
  x1: number, x2: number, period: number, lengthscale: number, variance: number
): number {
  const d = Math.abs(x1 - x2);
  const sinTerm = Math.sin(Math.PI * d / period);
  return variance * Math.exp(-2 * (sinTerm * sinTerm) / (lengthscale * lengthscale));
}

// ============================================================
// Numerical Stability Utilities
// ============================================================

/**
 * Log-sum-exp: log(Σ exp(x_i)) computed stably.
 * Essential for BOCD run-length posterior normalization.
 */
export function logSumExp(logValues: number[]): number {
  if (logValues.length === 0) return -Infinity;
  const maxVal = Math.max(...logValues);
  if (maxVal === -Infinity) return -Infinity;
  let sum = 0;
  for (const v of logValues) {
    sum += Math.exp(v - maxVal);
  }
  return maxVal + Math.log(sum);
}

/**
 * Normalize log-probabilities to a probability distribution.
 * Returns array of probabilities that sum to 1.
 */
export function stableNormalize(logProbs: number[]): number[] {
  const logZ = logSumExp(logProbs);
  return logProbs.map(lp => Math.exp(lp - logZ));
}

/**
 * CDF of the standard normal distribution (for threshold crossing probability).
 * Abramowitz & Stegun approximation.
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

// ============================================================
// GP Posterior Computation
// ============================================================

export type KernelFn = (x1: number, x2: number) => number;

/**
 * Compute GP posterior mean and variance at test points.
 * Pure GP math — no side effects.
 *
 * @param xTrain Training input locations
 * @param yTrain Training output values
 * @param xTest Test input locations
 * @param kernel Kernel function (already partially applied with hyperparams)
 * @param noiseVariance Observation noise variance σ²_n
 * @returns { mean: number[], variance: number[] } or null if Cholesky fails
 */
export function gpPosterior(
  xTrain: number[],
  yTrain: number[],
  xTest: number[],
  kernel: KernelFn,
  noiseVariance: number
): { mean: number[]; variance: number[] } | null {
  const n = xTrain.length;
  const m = xTest.length;

  if (n === 0) {
    // No training data: return prior (zero mean, kernel variance)
    const priorVar = kernel(0, 0);
    return {
      mean: new Array(m).fill(0),
      variance: new Array(m).fill(priorVar),
    };
  }

  // K(X,X) + σ²I
  const Kxx: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      const k = kernel(xTrain[i], xTrain[j]);
      Kxx[i][j] = k + (i === j ? noiseVariance : 0);
      Kxx[j][i] = k + (i === j ? noiseVariance : 0);
    }
  }

  const L = choleskyDecompose(Kxx);
  if (!L) return null;

  // alpha = (K + σ²I)^{-1} y
  const alpha = choleskySolve(L, yTrain);

  // K(X*,X) and K(X*,X*)
  const mean = new Array(m).fill(0);
  const variance = new Array(m).fill(0);

  for (let i = 0; i < m; i++) {
    // k* = K(x*, X)
    const kStar = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      kStar[j] = kernel(xTest[i], xTrain[j]);
    }

    // Mean: k*^T alpha
    let mu = 0;
    for (let j = 0; j < n; j++) {
      mu += kStar[j] * alpha[j];
    }
    mean[i] = mu;

    // Variance: k** - k*^T (K + σ²I)^{-1} k*
    // Solve L v = k* (forward substitution only)
    const v = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[j][k] * v[k];
      }
      v[j] = (kStar[j] - sum) / L[j][j];
    }

    let vTv = 0;
    for (let j = 0; j < n; j++) {
      vTv += v[j] * v[j];
    }

    variance[i] = kernel(xTest[i], xTest[i]) - vTv;
    // Clamp to avoid negative variance from numerical error
    if (variance[i] < 0) variance[i] = 1e-10;
  }

  return { mean, variance };
}
