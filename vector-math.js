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
    }

};