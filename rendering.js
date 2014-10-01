// "Strip" types - every vertical strip in a column will be one of these.
var S_DUMMY = 'strip:dummy', S_FLOOR = 'strip:floor', S_CEILING = 'strip:ceiling', S_WALL = 'strip:wall';
// "Span" types - every horizontal span will be one of these.
var SP_FLOOR = 'span:floor', SP_CEILING = 'span:ceiling';

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
    projectWalls: function(pointOfView, levelMap) {
        // how are we projecting this thing?
        var screenWidth = this.projection.screenWidth, screenHeight = this.projection.screenHeight;
        var screenCenterY = Math.ceil(screenHeight / 2);
        var projection = this.projection;

        // how are we lighting it?
        var lightPower = 8.0, diffuse = 0.4, ambient = 0.6;

        // where are we rendering from?
        var rayOrigin = {x: pointOfView.x, y: pointOfView.y};
        var eyeAngle = deg2rad(pointOfView.bearing);
        var eyeElevation = pointOfView.elevation;

        // what are the floor/ceiling elevations we should start with?
        var baseFloor = 1, baseCeiling = 0;

        // OK, Mr. Raycaster, go through all the columns on the screen
        var columns = new Array(screenWidth), column;
        for (var rx = 0; rx < screenWidth; rx++) {
            // every column starts empty
            column = [];

            // look for a wall (there will be one)
            var rayAngle = eyeAngle + projection.columns[rx].relativeAngle;
            var intersection = castRayAndReturnIntersections(rayOrigin, rayAngle);

            // project the wall strip
            var distance = distanceToWall(rayOrigin, intersection.intersectedAt);
            var z = distance * projection.columns[rx].angleCosine;
            var wall = projectWall(0.0, 1.0, z);

            // light the wall (simplified Phong lighting with no specularity)
            var lighting = lightPower / distance / distance; // attenuation with distance
            lighting = Math.min(1.0, lighting);
            lighting *= ambient + diffuse * Math.abs(intersection.ray.x * intersection.wallNormal.x + intersection.ray.y * intersection.wallNormal.y); // simplified Phong
            wall.lighting = lighting;

            // complete the wall information
            wall.kind = S_WALL;
            wall.texturing.texture = intersection.withCell.wallTexture;
            wall.texturing.u = intersection.textureU;

            // insert the new strip in the right place in the column
            insertStrip(column, wall);

            // cap the column off with a floor and ceiling if needed
            if (column[0].topY != 0)
                column.unshift({kind: S_CEILING, elevation: baseCeiling, topY: 0, bottomY: column[0].topY});
            if (_.last(column).bottomY != screenHeight)
                column.push({kind: S_FLOOR, elevation: baseFloor, topY: _.last(column).bottomY, bottomY: screenHeight});

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
                if (cell.floor < 1) {
                    // yup! that's a wall!
                    var intersectionPoint = {x: grid.x + frac.x, y: grid.y + frac.y};
                    return {
                        ray: {x: ray.x, y: ray.y},
                        intersectedAt: intersectionPoint,
                        wallNormal: {x: goingHorizontally ? ray.sgnX : 0, y: goingHorizontally ? 0 : ray.sgnY},
                        withCell: cell,
                        textureU: goingHorizontally ? frac.y : frac.x
                    };
                }
            }
        }

        function distanceToWall(rayOrigin, rayIntersection) {
            var distanceVec = {x: rayIntersection.x - rayOrigin.x, y: rayIntersection.y - rayOrigin.y}; // this is straight-line distance
            return Math.sqrt(distanceVec.x * distanceVec.x + distanceVec.y * distanceVec.y);
        }

        function projectWall(top, bottom, zDistance) {
            // scale according to Z distance
            var scalingFactor = projection.distance / zDistance;

            // texturing (before clipping)
            var texVStart = top, texVEnd = bottom;

            // world space to projection plane space
            var relativeTop = top - eyeElevation, relativeBottom = bottom - eyeElevation;
            var projectedTop = relativeTop * scalingFactor / projection.height;
            var projectedBottom = relativeBottom * scalingFactor / projection.height;

            // clip to screen
            if (projectedTop < -0.5) {
                // clip texture coordinates too
                texVStart += (texVEnd - texVStart) * (-0.5 - projectedTop) / (projectedBottom - projectedTop);
                projectedTop = -0.5;
            }
            if (projectedBottom > 0.5)
            {
                texVEnd -= (texVEnd - texVStart) * (projectedBottom - 0.5) / (projectedBottom - projectedTop);
                projectedBottom = 0.5;
            }

            // projection plane space to screen space
            var screenTop = Math.round((0.5 + projectedTop) * screenHeight);
            var screenBottom = Math.round((0.5 + projectedBottom) * screenHeight);

            return {
                topY: screenTop, bottomY: screenBottom,
                texturing: {topV: texVStart, bottomV: texVEnd}
            };
        }

        /**
         * Inserts a new strip into a column, keeping them nicely sorted
         * top to bottom.
         *
         * @param strips existing strips
         * @param newStrip the new strip to add
         */
        function insertStrip(strips, newStrip) {
            if (strips.length == 0) {
                // nobody else here, happy coincidence
                strips.push(newStrip);
                return;
            }

            // look for the right place
            for (var i = 0; i < strips.length; i++) {
                if (strips[i].bottomY > newStrip.bottomY) {
                    // this is the place
                    strips.splice(i, 0, newStrip);
                    return;
                }
            }
        }
     }
};

// ===============================================================

/**
 * Responsible for inferring the position of flat surfaces (floors, ceilings)
 * from projected wall information, and transforming it into horizontal spans
 * ready to be drawn.
 *
 * Basically transform from columns to rows like this.
 *
 *   ||||||        ------
 *  ||||||   =>   ------
 * |||||         -----
 *
 * @param {Projection} projection the Projection to use
 * @constructor
 */
function SpanCollector(projection) {
    this.projection = projection;
}
SpanCollector.prototype = {
    /**
     * Processes walls to make spans, see class description.
     * @param projectedWalls the wall data from WallRaycaster
     */
    inferFloorsAndCeilings: function(projectedWalls) {
        var screenWidth = projection.screenWidth, screenHeight = projection.screenHeight;

        // we'll be working on a copy of the wall data, as we'd like to remove/modify strips we've processed
        // we also filter the copy so it only has floors and ceilings, no distractions
        var columns = projectedWalls.map(function(column) {
            return column.filter(function(strip) {
                // only floors and ceilings
                return strip.kind == S_CEILING || strip.kind == S_FLOOR;
            }).map(function(strip) {
                // create independent copies so we can freely modify them
                return JSON.parse(JSON.stringify(strip));
            });
        });

        // we cap off the copy with a fake column which will act as a sentinel during our flood fills below
        // that way, we don't have to check for going past screen width
        columns.push([{kind: S_DUMMY, topY: 0}, {kind: S_END, topY: screenHeight}]);

        var spans = [];
        _.map(columns, function(column, colX) {
            while (column.length) {
                // there is an unprocessed strip in this column
                // flood-fill a span starting from that strip
                var strip = column[0];
                spans.push(this.findACompleteSpan(strip, columns, colX));
            }
        });
    },

    /**
     * Finds a complete floor/ceiling span starting with the given vertical strip,
     * and DESTRUCTIVELY REMOVES all strips that went into that span from the
     * column array. If a strip was only partially used, its top/bottom values will
     * be MODIFIED to reflect that.
     *
     *
     */
    findACompleteSpan: function(startStrip, columns, startingX) {

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
                // wall?
                if (strip.kind == S_WALL) {
                    drawTexturedStrip(x, strip);
                    return;
                }

                // not a wall, pick a solid color based on strip type
                var r, g, b;
                switch(strip.kind) {
                    case S_FLOOR:    r = g = b = 100; break;
                    case S_CEILING:  r = g = b = 50; break;
                }

                // draw a vertical uniform strip in the buffer
                var startLoc = buffer.index(x, strip.topY),
                    endLoc = buffer.index(x, strip.bottomY);
                for (var loc = startLoc; loc < endLoc; loc += verticalStride) {
                    pixels[loc++] = r; pixels[loc++] = g; pixels[loc++] = b;
                }
            });
        });

        function drawTexturedStrip(stripX, strip) {
            // TODO: add support for wrapping textures

            var texturingInfo = strip.texturing;
            var texture = texturingInfo.texture;
            var lighting = strip.lighting;

            var tex = texture.pixels, buf = buffer.data;

            // calculate starting UV coordinates for texturing
            var texU = Math.floor(texture.height * texturingInfo.u);
            var texV = Math.floor(texture.width * texturingInfo.topV);
            var texLoc = texU * texture.width + texV;

            // calculate how fast we should step through the texture (V per screen pixel)
            var texVStep = texture.width * (texturingInfo.bottomV - texturingInfo.topV) / (strip.bottomY - strip.topY);

            // start the counter we will be using to step through texture pixels (counts fractional texels)
            var texFracV = texture.width * texturingInfo.topV - texV;

            // extract first texel
            var r, g, b;
            var texel = tex[texLoc];
            // calculate pixel color based on texel
            r = (texel & 0xff) * lighting;
            g = ((texel >> 8) & 0xff) * lighting;
            b = ((texel >> 16) & 0xff) * lighting;

            // go through the whole strip vertically
            var startLoc = buffer.index(stripX, strip.topY),
                endLoc = buffer.index(stripX, strip.bottomY);
            for (var loc = startLoc; loc < endLoc; loc += verticalStride) {
                // draw the pixel
                buf[loc++] = r; buf[loc++] = g; buf[loc++] = b;

                // move through the texture
                texFracV += texVStep;
                if (texFracV > 1) {
                    if (texFracV > 2) {
                        // we have to move more than one pixel down - do the more expensive calculation
                        var steps = Math.floor(texFracV);
                        texLoc += steps;
                        texFracV -= steps;
                    } else {
                        // one pixel at a time is easy and fast
                        texLoc++;
                        texFracV--;
                    }

                    // calculate new color to draw with based on the new texel
                    texel = tex[texLoc];
                    r = (texel & 0xff) * lighting;
                    g = ((texel >> 8) & 0xff) * lighting;
                    b = ((texel >> 16) & 0xff) * lighting;
                }
            }
        }
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
        var view = this.raycastingStep.projectWalls(pointOfView, levelMap);
        this.drawingStep.renderView(view);
        this.buffer.show();
    }
};
