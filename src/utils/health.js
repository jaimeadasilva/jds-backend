/**
 * src/utils/health.js
 * Health calculation utilities used by API responses.
 */

/**
 * Calculate BMI.
 * @param {number} weightKg
 * @param {number} heightCm
 * @returns {number} BMI rounded to 1 decimal
 */
function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  return Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;
}

/**
 * Devine Formula for Ideal Body Weight.
 * Defaults to female formula (used as neutral baseline).
 * @param {number} heightCm
 * @param {"male"|"female"} gender
 * @returns {number} IBW in kg
 */
function calcIBW(heightCm, gender = "female") {
  if (!heightCm) return null;
  const base  = gender === "male" ? 50 : 45.5;
  const extra = ((heightCm - 152.4) / 2.54) * 2.3;
  return Math.round(base + extra);
}

/**
 * BMI category label + color hint.
 */
function bmiCategory(bmi) {
  if (bmi === null) return null;
  if (bmi < 18.5) return { label: "Underweight", code: "blue" };
  if (bmi < 25)   return { label: "Healthy",     code: "green" };
  if (bmi < 30)   return { label: "Overweight",  code: "orange" };
  return               { label: "Obese",          code: "red" };
}

/**
 * Attach computed health fields to a client object.
 */
function enrichClient(client) {
  const bmi = calcBMI(client.weight_kg, client.height_cm);
  return {
    ...client,
    bmi,
    bmi_category: bmiCategory(bmi),
    ideal_weight_kg: calcIBW(client.height_cm),
  };
}

module.exports = { calcBMI, calcIBW, bmiCategory, enrichClient };
