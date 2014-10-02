/**
 * Converts an angle to radians.
 * @param degrees angle in degress
 * @returns {number} angle in radians
 */
function deg2rad(degrees) {
    return degrees / 180.0 * Math.PI;
}


// vector arithmetic

function vectorLengthSq(vector) {
    return vector.x * vector.x + vector.y * vector.y;
}

function vectorLength(vector) {
    return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function normalize(vector) {
    var length = vectorLength(vector);
    vector.x /= length;
    vector.y /= length;
}