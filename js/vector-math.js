Vec = {
    /**
     * Dot product of two vectors.
     */
    dot: function(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    },

    /**
     * Length of a vector.
     */
    len: function(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    },

    /**
     * Squared length of a vector.
     */
    lenSq: function(v) {
        return v.x * v.x + v.y * v.y;
    },

    /**
     * Returns a normalized (unit-length) version of the vector.
     */
    normalize: function(v) {
        var length = Vec.length(v);
        return {x: v.x / length, y: v.y / length}
    },

    /**
     * Adds two vectors.
     */
    add: function(v1, v2) {
        return {x: v1.x + v2.x, y: v1.y + v2.y};
    },

    /**
     * Adds a vector to another in place (like +=).
     */
    addInPlace: function(v, a) {
        v.x += a.x; v.y += a.y;
        return v;
    },

    /**
     * Subtracts two vectors.
     */
    sub: function(v1, v2) {
        return {x: v1.x - v2.x, y: v1.y - v2.y};
    },

    /**
     * Multiplies a vector by a number.
     */
    mul: function(v1, n) {
        return {x: v1.x * n, y: v1.y * n};
    },

    /**
     * Component-wise multiplication of two vectors.
     */
    cwMul: function(v1, v2) {
        return {x: v1.x * v2.x, y: v1.y * v2.y};
    },

    /**
     * Component-wise division of two vectors.
     */
    cwDiv: function(v1, v2) {
        return {x: v1.x / v2.x, y: v1.y / v2.y};
    },

    /**
     * Takes an angle and returns the unit vector
     * corresponding to it.
     */
    fromAngle: function(angle) {
        return {x: Math.sin(angle), y: -Math.cos(angle)};
    },

    /**
     * Takes a bearing (0 = north, 360 degrees) and returns
     * the unit vector corresponding to it.
     */
    fromBearing: function(bearing) {
        var angle = deg2rad(bearing);
        return Vec.fromAngle(angle);
    },

    /**
     * Returns a vector rotated 90 degrees clockwise.
     */
    rotate90Clockwise: function(v) {
        //noinspection JSSuspiciousNameCombination
        return {x: -v.y, y: v.x};
    },

    /**
     * Returns the distance between two points represented as vectors.
     */
    distance: function(v1, v2) {
        return Vec.len(Vec.sub(v1, v2));
    },

    /**
     * Rounds each component of the vector towards -Infinity.
     */
    integer: function(v) {
        return {x: Math.floor(v.x), y: Math.floor(v.y)};
    },

    /**
     * Returns a vector with just the fractional parts of each component (relative to
     * Vec.integer, always positive).
     * @param v
     */
    frac: function(v) {
        var fracX = v.x % 1, fracY = v.y % 1;
        if (fracX < 0) fracX = 1.0 - fracX;
        if (fracY < 0) fracY = 1.0 - fracY;
        return {x: fracX, y: fracY};
    }
};