# Peptide OS - Reconstitution Mathematics

## Overview

Reconstitution is the process of dissolving lyophilized (freeze-dried) peptide powder in bacteriostatic water (BAC water) to create an injectable solution. Accurate calculations are critical for proper dosing.

## Core Concepts

### Key Terms

| Term | Definition |
|------|------------|
| **Vial Amount** | Total quantity of peptide in the vial (e.g., 5 mg) |
| **Diluent Volume** | Amount of bacteriostatic water added (e.g., 2 ml) |
| **Concentration** | Peptide amount per unit volume (e.g., 2.5 mg/ml) |
| **Target Dose** | Desired amount per injection (e.g., 250 mcg) |
| **Injection Volume** | Amount to draw into syringe (e.g., 0.1 ml) |

### Unit Conversions

| From | To | Multiply By |
|------|-----|-------------|
| mg | mcg | 1,000 |
| mcg | mg | 0.001 |
| ml | units (insulin syringe) | 100 |
| units | ml | 0.01 |

---

## Calculation Steps

### Step 1: Calculate Concentration

After reconstitution, determine how much peptide is in each milliliter.

```
Concentration = Vial Amount ÷ Diluent Volume
```

**Example:**
- Vial: 5 mg BPC-157
- Diluent: 2 ml BAC water

```
Concentration = 5 mg ÷ 2 ml = 2.5 mg/ml
```

This can also be expressed as:
```
2.5 mg/ml = 2,500 mcg/ml
```

---

### Step 2: Calculate Volume Per Dose

Determine how much solution to draw for your target dose.

```
Volume Per Dose = Target Dose ÷ Concentration
```

**Example:**
- Target dose: 250 mcg
- Concentration: 2.5 mg/ml (2,500 mcg/ml)

First, ensure units match:
```
Volume Per Dose = 250 mcg ÷ 2,500 mcg/ml = 0.1 ml
```

---

### Step 3: Convert to Syringe Units

Standard insulin syringes are calibrated in "units" where 100 units = 1 ml.

```
Syringe Units = Volume (ml) × 100
```

**Example:**
```
0.1 ml × 100 = 10 units
```

So draw to the 10-unit mark on an insulin syringe.

---

### Step 4: Calculate Total Doses Per Vial

Estimate how many injections you can get from one vial.

```
Total Doses = Diluent Volume ÷ Volume Per Dose
```

**Example:**
```
Total Doses = 2 ml ÷ 0.1 ml = 20 doses
```

---

## Complete Example

### Scenario: BPC-157 Protocol

**Given:**
- Vial contains: 5 mg BPC-157
- Adding: 2 ml BAC water
- Target dose: 250 mcg twice daily

**Calculations:**

1. **Concentration:**
   ```
   5 mg ÷ 2 ml = 2.5 mg/ml = 2,500 mcg/ml
   ```

2. **Volume per dose:**
   ```
   250 mcg ÷ 2,500 mcg/ml = 0.1 ml
   ```

3. **Syringe units:**
   ```
   0.1 ml × 100 = 10 units
   ```

4. **Doses per vial:**
   ```
   2 ml ÷ 0.1 ml = 20 doses
   ```

5. **Days supply (at 2x daily):**
   ```
   20 doses ÷ 2 = 10 days
   ```

---

## Semaglutide Example

Semaglutide uses different dosing conventions. Here's a practical example:

**Given:**
- Vial contains: 5 mg semaglutide
- Adding: 2.5 ml BAC water
- Target dose: 0.5 mg weekly

**Calculations:**

1. **Concentration:**
   ```
   5 mg ÷ 2.5 ml = 2 mg/ml
   ```

2. **Volume per dose:**
   ```
   0.5 mg ÷ 2 mg/ml = 0.25 ml
   ```

3. **Syringe units:**
   ```
   0.25 ml × 100 = 25 units
   ```

4. **Doses per vial:**
   ```
   2.5 ml ÷ 0.25 ml = 10 doses = 10 weeks
   ```

---

## Unit Handling in Code

The calculator automatically handles unit conversions:

```typescript
// Unit conversion factors to mcg (base unit)
const UNIT_TO_MCG: Record<DoseUnit, number> = {
  mcg: 1,
  mg: 1000,
  IU: 1, // IU is kept as-is, not converted
}

function calculateReconstitution(input: ReconstitutionInput): ReconstitutionResult {
  const { vialAmount, vialUnit, diluentVolume, targetDose, targetUnit } = input

  // Step 1: Calculate concentration
  const concentration = vialAmount / diluentVolume
  const concentrationUnit = `${vialUnit}/ml`

  // Step 2: Calculate volume per dose (if target provided)
  if (targetDose && targetUnit) {
    let convertedTargetDose = targetDose

    // Convert if units differ (except IU)
    if (targetUnit !== vialUnit && vialUnit !== 'IU' && targetUnit !== 'IU') {
      const targetInMcg = targetDose * UNIT_TO_MCG[targetUnit]
      convertedTargetDose = targetInMcg / UNIT_TO_MCG[vialUnit]
    }

    const volumePerDose = convertedTargetDose / concentration
    const totalDoses = Math.floor(diluentVolume / volumePerDose)

    return { concentration, concentrationUnit, volumePerDose, totalDoses }
  }

  return { concentration, concentrationUnit }
}
```

---

## Important Notes

### IU (International Units)

IU is a measurement based on biological activity, not weight. It cannot be directly converted to mg or mcg. Common peptides measured in IU include:

- HCG
- HGH (also measured in mg)
- Some insulin preparations

When using IU, ensure both vial and target dose use the same unit.

### Precision

- Volume calculations should use at least 4 decimal places
- Round syringe units to nearest 0.5 for practical use
- When in doubt, err on the side of less volume (lower dose)

### Safety Margins

- Standard insulin syringes: 0.3 ml, 0.5 ml, or 1 ml capacity
- Minimum practical dose: ~2-3 units (0.02-0.03 ml)
- Maximum practical dose per injection site: ~1 ml

### Bacteriostatic Water Guidelines

- Use bacteriostatic water, not sterile water
- BAC water contains 0.9% benzyl alcohol as preservative
- Multi-use is safe for 28 days when refrigerated
- Sterile water is single-use only

---

## Quick Reference Chart

For a **5 mg vial** with different reconstitution volumes:

| Diluent | Concentration | 100 mcg dose | 250 mcg dose | 500 mcg dose |
|---------|---------------|--------------|--------------|--------------|
| 1 ml | 5 mg/ml | 2 units | 5 units | 10 units |
| 2 ml | 2.5 mg/ml | 4 units | 10 units | 20 units |
| 2.5 ml | 2 mg/ml | 5 units | 12.5 units | 25 units |
| 5 ml | 1 mg/ml | 10 units | 25 units | 50 units |

**Guideline:** More diluent = lower concentration = larger injection volumes (easier to measure accurately, but more liquid to inject).

---

## Reconstitution Best Practices

1. **Let vials warm to room temperature** before reconstituting
2. **Inject diluent slowly** along the vial wall, not directly onto powder
3. **Swirl gently** - never shake
4. **Wait for complete dissolution** - solution should be clear
5. **Label vials** with reconstitution date and concentration
6. **Refrigerate immediately** after reconstitution
7. **Use within 28 days** of reconstitution
