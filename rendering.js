// "Strip" types - every vertical strip in a colum will be one of these.
var S_FLOOR = 'floor', S_CEILING = 'ceiling', S_WALL = 'wall', S_END = 'end';
// Wall directions for intersections information
var WD_HORIZONTAL = 'h', WD_VERTICAL = 'v';

// ===============================================================

// constants for the projection we want
function Projection(buffer, fovInDegrees, projectionPlaneWidth) {
    // get screen dimensions
    var screenWidth = this.screenWidth = buffer.width;
    var screenHeight = this.screenHeight = buffer.height;

    // calculate projection plane parameters from the desired FOV
    var fov = deg2rad(fovInDegrees);
    this.width = projectionPlaneWidth;
    this.height = projectionPlaneWidth * screenHeight / screenWidth;
    this.distance = this.width * 0.5 / Math.tan(fov * 0.5);

    // cache projection information for each screen column
    var projectionColumns = new Array(screenWidth);
    var pxInc = this.width / screenWidth;
    for (var screenX = 0, projectionX = -this.width / 2 + pxInc / 2; screenX < screenWidth; screenX++, projectionX += pxInc) {
        var angle = Math.atan2(projectionX, this.distance);
        projectionColumns[screenX] = {
            relativeAngle: angle,
            angleCosine:   Math.cos(angle)
        };
    }
    this.columns = projectionColumns;
}

// ===============================================================

function Buffer(canvas) {
    this.context = canvas.getContext('2d');
    this.canvasPixelArray  = this.context.createImageData(canvas.width, canvas.height);
    this.data = this.canvasPixelArray.data;
    this.width = canvas.width;
    this.height = canvas.height;

    this.setupAlphaChannel();
}
Buffer.prototype = {
    setupAlphaChannel: function() {
        // set alpha to 255 for the rest of eternity
        var data = this.data;
        for (var i = 3; i < data.length; i += 4)
            data[i] = 255;
    },

    /**
     * Draws the contents of the buffer onto the canvas.
     */
    show: function() {
        this.context.putImageData(this.canvasPixelArray, 0, 0);
    },

    /**
     * Returns the index in the 'data' array corresponding to the first component
     * of a pixel at chosen coordinates.
     * @param x the x coordinate of the pixel we want
     * @param y ditto, y
     */
    index: function(x, y) {
        return (y * this.width + x) << 2;
    }
};

// ===============================================================

function WallRaycaster(projection) {
    this.projection = projection;
}
WallRaycaster.prototype = {
    projectWallsAndFloors: function(pointOfView, levelMap) {
        // how are we projecting this thing?
        var screenWidth = this.projection.screenWidth, screenHeight = this.projection.screenHeight;
        var screenCenterY = Math.ceil(screenHeight / 2);
        var projection = this.projection;
        var lightPower = 5.0, diffuse = 0.4, ambient = 0.6;

        // where are we rendering from?
        var rayOrigin = {x: pointOfView.x, y: pointOfView.y};
        var eyeAngle = deg2rad(pointOfView.bearing);

        // go through all the columns in the screen
        var columns = new Array(screenWidth), column;
        for (var rx = 0; rx < screenWidth; rx++) {
            // every column starts with just the floor and ceiling
            column = [
                {kind: S_CEILING, topY: 0},
                {kind: S_FLOOR, topY: screenCenterY},
                {kind: S_END, topY: screenHeight} // sentinel value for simplifying various algorithms
            ];

            // look for the wall
            var rayAngle = eyeAngle + projection.columns[rx].relativeAngle;
            var intersection = castRayAndReturnIntersections(rayOrigin, rayAngle);

            // project the wall strip
            var distance = distanceToWall(rayOrigin, intersection.intersectedAt);
            var z = distance * projection.columns[rx].angleCosine;
            var wall = projectWall(-0.5, 0.5, z);

            // light the wall (simplified Phong lighting with no specularity)
            var lighting = lightPower / distance / distance; // attenuation with distance
            lighting = Math.min(1.0, lighting);
            lighting *= ambient + diffuse * Math.abs(intersection.ray.x * intersection.wallNormal.x + intersection.ray.y * intersection.wallNormal.y); // simplified Phong
            wall.lighting = lighting;

            // insert the new strip, along with metadata
            wall.kind = S_WALL;
            wall.color = [200, 200, 255];
            insertStrip(column, wall);

            // store the finished column
            columns[rx] = column;
        }

        return columns;

        // ==== raycasting substeps below

        function castRayAndReturnIntersections(origin, angle) {
            var cells = levelMap.cells, lW = levelMap.width;

            // we'll keep the integral and fractional part of where the ray is separate
            // this will make the algorithm easier
            var grid = {x: Math.floor(origin.x), y: Math.floor(origin.y)},
                frac = {x: origin.x - grid.x, y: origin.y - grid.y};

            // prepare all information about the ray we're going to need
            var ray = {x: Math.sin(angle), y: -Math.cos(angle)}; // set up so bearings work like on a compass

            ray.absX = Math.abs(ray.x); ray.absY = Math.abs(ray.y);
            ray.invAbsX = 1 / Math.abs(ray.x); ray.invAbsY = 1 / Math.abs(ray.y);
            ray.sgnX = (ray.x > 0) ? 1 : -1; ray.sgnY = (ray.y > 0) ? 1 : -1;
            ray.ratioXY = ray.absX / ray.absY; ray.ratioYX = ray.absY / ray.absX;

            // we iterate until we hit something, at which point we'll return
            while(true) {
                // determine if the next grid cell the ray will hit
                // is going to be to the right/left or up/down
                var xDist = (ray.x > 0) ? (1.0 - frac.x) : frac.x, yDist = (ray.y > 0) ? (1.0 - frac.y) : frac.y;
                var xTime = xDist * ray.invAbsX, yTime = yDist * ray.invAbsY;
                var goingHorizontally = xTime < yTime;

                // move the ray to the next possible intersection point
                if (goingHorizontally) {
                    // go to the next horizontal grid (right or left depending on ray.x)
                    grid.x += ray.sgnX;
                    frac.x = (ray.x < 0) ? 1 : 0;
                    frac.y += ray.sgnY * xDist * ray.ratioYX;
                } else {
                    // go to the next vertical grid (up or down depending on ray.y)
                    grid.y += ray.sgnY;
                    frac.y = (ray.y < 0) ? 1 : 0;
                    frac.x += ray.sgnX * yDist * ray.ratioXY;
                }

                // we're in the next grid, did we hit?
                var cell = cells[grid.y * lW + grid.x];
                if (cell.floor > 0) {
                    // yup! that's a wall!
                    var intersectionPoint = {x: grid.x + frac.x, y: grid.y + frac.y};
                    return {
                        ray: {x: ray.x, y: ray.y},
                        intersectedAt: intersectionPoint,
                        wallDirection: goingHorizontally ? WD_VERTICAL : WD_HORIZONTAL,
                        wallNormal: {x: goingHorizontally ? ray.sgnX : 0, y: goingHorizontally ? 0 : ray.sgnY},
                        withCell: cell
                    };
                }
            }
        }

        function distanceToWall(rayOrigin, rayIntersection) {
            var distanceVec = {x: rayIntersection.x - rayOrigin.x, y: rayIntersection.y - rayOrigin.y}; // this is straight-line distance
            return Math.sqrt(distanceVec.x * distanceVec.x + distanceVec.y * distanceVec.y);
        }

        function projectWall(relativeTop, relativeBottom, zDistance) {
            // scale according to Z distance
            var scalingFactor = projection.distance / zDistance;
            var top = relativeTop * scalingFactor / projection.height;
            var bottom = relativeBottom * scalingFactor / projection.height;
            if (top < -0.5) top = -0.5;
            if (bottom > 0.5) bottom = 0.5;

            var screenTop = Math.round((0.5 + top) * screenHeight);
            var screenBottom = Math.round((0.5 + bottom) * screenHeight);

            return {topY: screenTop, bottomY: screenBottom};
        }

        function insertStrip(strips, newStrip) {
            for (var i = 1; ; i++) {
                var nextStrip = strips[i];
                if (nextStrip.topY > newStrip.topY) {
                    // insert here
                    strips.splice(i, 0, newStrip);
                    // fix up the top of next strip to our bottom
                    nextStrip.topY = newStrip.bottomY;
                    return;
                }
            }
        }
    }
};

// ===============================================================

function LevelRenderer(buffer) {
    this.buffer = buffer;
}
LevelRenderer.prototype = {
    renderView: function(view) {
        var buffer = this.buffer;
        var pixels = buffer.data;
        var screenWidth = buffer.width;
        var verticalStride = screenWidth * 4 - 3;

        // go through all the columns
        view.map(function(column, x) {
            // and the strips in them
            column.map(function(strip, s) {
                if (strip.kind == S_END) return;

                // calculate locations in the buffer where the strip starts/ends
                var nextStrip = column[s+1];

                // pick color based on strip type
                var r, g, b;
                switch(strip.kind) {
                    case S_FLOOR:    r = g = b = 100; break;
                    case S_CEILING:  r = g = b = 50; break;
                    default:
                        r = strip.color[0] * strip.lighting;
                        g = strip.color[1] * strip.lighting;
                        b = strip.color[2] * strip.lighting;
                }

                // draw a vertical uniform strip in the buffer
                var startLoc = buffer.index(x, strip.topY),
                    endLoc = buffer.index(x, nextStrip.topY);
                for (var loc = startLoc; loc < endLoc; loc += verticalStride) {
                    pixels[loc++] = r; pixels[loc++] = g; pixels[loc++] = b;
                }
            });
        })
    }
};

// ===============================================================

function Renderer(buffer, projection) {
    this.buffer = buffer;
    this.projection = projection;

    this.raycastingStep = new WallRaycaster(this.projection);
    this.drawingStep = new LevelRenderer(this.buffer);
}
Renderer.prototype = {
    renderFrame: function(pointOfView, levelMap) {
        var view = this.raycastingStep.projectWallsAndFloors(pointOfView, levelMap);
        this.drawingStep.renderView(view);
        this.buffer.show();
    }
};
