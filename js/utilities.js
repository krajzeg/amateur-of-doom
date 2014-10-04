/**
 * Converts an angle to radians.
 * @param degrees angle in degress
 * @returns {number} angle in radians
 */
function deg2rad(degrees) {
    return degrees / 180.0 * Math.PI;
}

/**
 * Returns the fractional part of the number. For negative
 * numbers, the result will be positive too: frac(-2.7) = 0.3 (-2.7 - (-3)).
 * We always count from the lower integer.
 */
function frac(number) {
    var f = number % 1;
    return (f < 0.0) ? f + 1 : f;
}