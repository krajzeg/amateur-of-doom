// "Strip" and "span" types - every pixel on the screen will be assigned to one of these
var S_FLOOR = 0, S_CEILING = 1, S_WALL = 2;
// Wall types (whether they come up from the floor or down from the ceiling
var WT_FLOOR = 0, WT_CEILING = 1;

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
Projection.prototype = {
    /**
     * Calculates the map coordinates (x,y) corresponding to a point
     * on the screen. Needed for texture calculations.
     */
    unprojectPoint: function(pointOfView, screenX, screenY, elevation) {
        // first, transform to projection plane
        var projected=  {
            x: ((screenX + 0.5) / this.screenWidth - 0.5) * this.width,
            y: ((screenY + 0.5) / this.screenHeight - 0.5) * this.height
        };

        // then, calculate X and Z in player space (from his point of view)
        var elevationDifference = Math.abs(pointOfView.elevation - elevation);
        var psZ = this.distance * elevationDifference / Math.abs(projected.y);
        var psX = projected.x * psZ / this.distance;

        // rotate into map space
        var unitZ = pointOfView.coordinateSpace.z, unitX = pointOfView.coordinateSpace.x;
        var mapped = Vec.add(Vec.mul(unitZ, psZ), Vec.mul(unitX, psX));
        Vec.addInPlace(mapped, pointOfView);

        // return
        return {mapped: mapped, playerSpaceX: psX, playerSpaceZ: psZ};
    }
};

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

function Lighting(lightPower, ambient, diffuse) {
    this.lightPower = lightPower;
    this.ambient = ambient;
    this.diffuse = diffuse;
}
Lighting.prototype = {
    lightingFactor: function(surfaceNormal, surfaceDistance, lightVector) {
        var lighting = this.lightPower / (surfaceDistance * surfaceDistance); // attenuation with distance
        lighting = Math.min(1.0, lighting);
        lighting *= this.ambient + this.diffuse * Math.abs(Vec.dot(surfaceNormal, lightVector));

        return lighting;
    }
};

// ===============================================================

function WallRaycaster(projection) {
    this.projection = projection;
    this.lighting = new Lighting(8.0, 0.3, 0.7);
}
WallRaycaster.prototype = {
    projectWalls: function(pointOfView, levelMap) {
        var self = this;
        // how are we projecting this thing?
        var screenWidth = this.projection.screenWidth, screenHeight = this.projection.screenHeight;
        var screenCenterY = screenHeight / 2;
        var projection = this.projection;

        // where are we rendering from?
        var rayOrigin = {x: pointOfView.x, y: pointOfView.y};
        var eyeAngle = deg2rad(pointOfView.bearing);
        var eyeElevation = pointOfView.elevation;

        var originFloor = levelMap.floorAt(rayOrigin),
            originCeiling = levelMap.ceilingAt(rayOrigin);

        // OK, Mr. Raycaster, go through all the columns on the screen
        var columns = new Array(screenWidth), column;
        for (var rx = 0; rx < screenWidth; rx++) {
            // every column starts empty
            var floorStrips = [], ceilingStrips = [];

            // look for a wall (there will be one)
            var rayAngle = eyeAngle + projection.columns[rx].relativeAngle;
            var intersections = castRayAndReturnIntersections(rayOrigin, rayAngle);

            // go through all the walls we've encountered, near-to-far, and store their info
            var clippingTop = 0, clippingBottom = screenHeight;

            // current floor/ceiling elevations are going to be important for rendering
            var currentFloor = originFloor, currentCeiling = originCeiling;

            intersections.map(function(intersection) {
                var wallKind = intersection.wallType;

                // project the wall
                var distance = Vec.distance(rayOrigin, intersection.intersectedAt);
                var z = distance * projection.columns[rx].angleCosine;
                var wall;
                switch(wallKind) {
                    case WT_FLOOR:   wall = projectWall(intersection.top, intersection.bottom, z); break;
                    case WT_CEILING: wall = projectWall(intersection.bottom, intersection.top, z); break;
                }

                // project the floor/ceiling up to this wall
                if (wallKind == WT_FLOOR) {
                    // calculate the floor strip
                    var floorTop = wall.bottomY;
                    var floorStrip = {
                        kind: S_FLOOR, elevation: currentFloor.elevation,
                        topY: floorTop, bottomY: clippingBottom,
                        texture: currentFloor.flatTexture};
                    floorStrip = clipStrip(floorStrip, clippingTop, clippingBottom);
                    if (floorStrip.topY < floorStrip.bottomY)
                        floorStrips.unshift(floorStrip);

                    // update drawing information
                    clippingBottom = Math.min(floorTop, clippingBottom);
                    currentFloor = intersection.withCell;
                }
                if (wallKind == WT_CEILING) {
                    var ceilingStrip = {
                        kind: S_CEILING, elevation: currentCeiling.elevation,
                        topY: clippingTop, bottomY: wall.topY,
                        texture: currentCeiling.flatTexture
                    };
                    ceilingStrip = clipStrip(ceilingStrip, clippingTop, clippingBottom);
                    if (ceilingStrip.topY < ceilingStrip.bottomY)
                        ceilingStrips.push(ceilingStrip);

                    // update drawing information
                    clippingTop = Math.max(wall.topY, clippingTop);
                    currentCeiling = intersection.withCell;
                }

                // back-facing wall?
                if (wall.topY > wall.bottomY)
                    return;

                // clip wall
                wall = clipStrip(wall, clippingTop, clippingBottom);
                if (wall.topY >= wall.bottomY) {
                    // clipped into oblivion, no need to do the rest
                    return;
                }

                // update clipping information
                switch(wallKind) {
                    case WT_FLOOR: clippingBottom = wall.topY; break;
                    case WT_CEILING: clippingTop = wall.bottomY; break;
                }

                // complete the wall information
                wall.kind = S_WALL;
                wall.texturing.texture = intersection.withCell.wallTexture;
                wall.texturing.u = intersection.textureU;

                // light the wall
                wall.lighting = self.lighting.lightingFactor(intersection.wallNormal, distance, intersection.ray);

                // insert the wall strip in the right place in the column
                switch(wallKind) {
                    case WT_FLOOR: floorStrips.unshift(wall); break;
                    case WT_CEILING: ceilingStrips.push(wall); break;
                }
            });

            // store the finished column
            columns[rx] = ceilingStrips.concat(floorStrips);
        }

        return columns;

        // ==== raycasting substeps below

        function castRayAndReturnIntersections(origin, angle) {
            var lW = levelMap.width;

            // we'll keep the integral and fractional part of where the ray is separate
            // this will make the algorithm easier
            var grid = {x: Math.floor(origin.x), y: Math.floor(origin.y)},
                frac = {x: origin.x - grid.x, y: origin.y - grid.y};

            // get the base floor/ceiling levels
            var currentFloor = levelMap.floorAt(grid);
            var currentCeiling = levelMap.ceilingAt(grid);

            // prepare all information about the ray we're going to need
            var ray = Vec.fromAngle(angle);

            var abs = {x: Math.abs(ray.x), y: Math.abs(ray.y)};
            var invAbs = Vec.cwDiv({x:1, y:1}, abs);
            var sgn = {x: (ray.x > 0) ? 1 : -1, y: (ray.y > 0) ? 1 : -1};
            var ratioXY = abs.x / abs.y, ratioYX = abs.y / abs.x;

            // we iterate until we hit the last wall (one which ends up filling the screen)
            var intersections = [];
            while(true) {
                // determine if the next grid cell the ray will hit
                // is going to be to the right/left or up/down
                var dist = {
                    x: (ray.x > 0) ? (1.0 - frac.x) : frac.x,
                    y: (ray.y > 0) ? (1.0 - frac.y) : frac.y
                };
                var time = Vec.cwMul(dist, invAbs);
                var goingHorizontally = time.x < time.y;

                // move the ray to the next possible intersection point
                if (goingHorizontally) {
                    // go to the next horizontal grid (right or left depending on ray.x)
                    grid.x += sgn.x;
                    frac.x = (ray.x < 0) ? 1 : 0;
                    frac.y += sgn.y * dist.x * ratioYX;
                } else {
                    // go to the next vertical grid (up or down depending on ray.y)
                    grid.y += sgn.y;
                    frac.y = (ray.y < 0) ? 1 : 0;
                    frac.x += sgn.x * dist.y * ratioXY;
                }

                // we're in the next grid, did we hit a wall?
                var floor = levelMap.floorAt(grid),
                    ceiling = levelMap.ceilingAt(grid);

                if (ceiling.elevation != currentCeiling.elevation)
                    makeIntersection(WT_CEILING, ceiling);
                if (floor.elevation != currentFloor.elevation)
                    makeIntersection(WT_FLOOR, floor);

                if (currentFloor.elevation == currentCeiling.elevation) {
                    // we've reached the final wall
                    // add a fake intersection to close up the opposing side
                    if (_.last(intersections).wallType == WT_FLOOR)
                        makeIntersection(WT_CEILING, currentCeiling)
                    else
                        makeIntersection(WT_FLOOR, currentFloor);

                    // return results
                    return intersections;
                }
            }

            function makeIntersection(wallType, cell) {
                var intersectionPoint = Vec.add(grid, frac);

                // texturing coordinate calculation
                var u;
                if (goingHorizontally) {
                    u = (ray.x > 0) ? frac.y : (1.0 - frac.y)
                } else {
                    u = (ray.y < 0) ? frac.x : (1.0 - frac.x);
                }

                // store all intersection information
                intersections.push({
                    ray: ray,
                    intersectedAt: intersectionPoint,
                    bottom: (wallType == WT_FLOOR) ? currentFloor.elevation : currentCeiling.elevation,
                    top: cell.elevation,
                    wallType: wallType,
                    wallNormal: {x: goingHorizontally ? sgn.x : 0, y: goingHorizontally ? 0 : sgn.y},
                    withCell: cell,
                    textureU: u
                });

                // raise the floor for future cells
                switch(wallType) {
                    case WT_FLOOR:   currentFloor = cell; break;
                    case WT_CEILING: currentCeiling = cell; break;
                }
            }
        }

        function projectWall(top, bottom, zDistance) {
            // scale according to Z distance
            var scalingFactor = projection.distance / (zDistance + 0.01) * screenHeight / projection.height;

            // texturing (before clipping)
            var texVStart = top, texVEnd = bottom;

            // world space to screen space
            var relativeTop = top - eyeElevation, relativeBottom = bottom - eyeElevation;
            var screenTop = Math.round(relativeTop * scalingFactor) + screenCenterY;
            var screenBottom = Math.round(relativeBottom * scalingFactor) + screenCenterY;

            return {
                topY: screenTop, bottomY: screenBottom,
                texturing: {topV: texVStart, bottomV: texVEnd}
            };
        }

        /**
         * Clips the top and bottom of a wall to just what's visible.
         */
        function clipStrip(strip, clipTop, clipBottom) {
            // clip the top
            if (strip.topY < clipTop) {
                if (strip.texturing) {
                    // clip texture coordinates too
                    var textureMeasure = strip.texturing.bottomV - strip.texturing.topV;
                    strip.texturing.topV += textureMeasure * (clipTop - strip.topY) / (strip.bottomY - strip.topY);
                }
                strip.topY = clipTop;
            }

            // clip the bottom
            if (strip.bottomY > clipBottom)
            {
                if (strip.texturing) {
                    // clip texture coordinates too
                    textureMeasure = strip.texturing.bottomV - strip.texturing.topV;
                    strip.texturing.bottomV -= textureMeasure * (strip.bottomY - clipBottom) / (strip.bottomY - strip.topY);
                }
                strip.bottomY = clipBottom;
            }

            return strip;
        }

        /**
         * Inserts a new strip into a column, keeping them nicely sorted
         * top to bottom.
         *
         * @param strips existing strips
         * @param newStrip the new strip to add
         */
        function insertStrip(strips, newStrip) {
            // look for the right place
            for (var i = 0; i < strips.length; i++) {
                if (strips[i].bottomY > newStrip.bottomY) {
                    // this is the place
                    strips.splice(i, 0, newStrip);
                    return;
                }
            }

            // splice at the end if it doesn't go before anything
            strips.push(newStrip);
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
    this.lighting = new Lighting(7.0, 0.3, 0.7);
}
SpanCollector.prototype = {
    /**
     * Processes walls to make spans, see class description.
     * @param pointOfView the point of view object with x, y, coordinateSpace, elevation
     * @param projectedWalls the wall data from WallRaycaster
     */
    inferFloorsAndCeilings: function(pointOfView, projectedWalls) {
        var self = this;

        // we'll be working on a copy of the wall data, as we'd like to remove/modify strips we've processed
        // we also filter the copy so it only has floors and ceilings, no distractions
        var columns = projectedWalls.map(function copyColumns(column) {
            return column.filter(function (strip) {
                // only floors and ceilings
                return strip.kind == S_CEILING || strip.kind == S_FLOOR;
            });
        });

        // we cap off the copy with a fake column which will act as a sentinel during our flood fills below
        // that way, we don't have to check for going past screen width
        columns.push([]);

        var spans = [];
        _.map(columns, function spanLoop(column, colX) {
            while (column.length) {
                // there is an unprocessed strip in this column
                // flood-fill a span starting from that strip
                var strip = column.shift();
                spans.push(findACompleteSpan(strip, columns, colX));
            }
        });

        // done!
        return spans;


        // ===== span collecting substeps below (closures)

        /**
         * Finds a complete floor/ceiling span starting with the given vertical strip,
         * and DESTRUCTIVELY REMOVES all strips that went into that span from the
         * column array. If a strip was only partially used, its top/bottom values will
         * be MODIFIED to reflect that.
         *
         * @param strip the leftmost strip used for finding the rest of the span
         * @param columns the column table
         * @param startingX the X position of the starting strip
         */
        function findACompleteSpan(strip, columns, startingX) {
            var screenHeight = self.projection.screenHeight;

            // start with the first strip
            var span = {
                kind: strip.kind,
                elevation: strip.elevation,
                texture: strip.texture,

                // topY-bottomY is the full 'bounding box' of the span
                topY: strip.topY,
                bottomY: strip.bottomY
            };
            var rows = new Array(screenHeight);
            for (var y = strip.topY; y < strip.bottomY; y++) {
                rows[y] = projectRowAt(startingX, y, span.elevation);
            }

            // flood fill following columns
            var columnX = startingX + 1;
            var activeStrip = strip;

            // this loop will be broken out of by returning the finished span
            while (true) {
                var column = columns[columnX];

                // find the next strip to include in the span
                var newStrip = null;
                for (var stripIndex = 0; stripIndex < column.length; stripIndex++) {
                    var candidate = column[stripIndex];

                    // does this match our span?
                    if (candidate.elevation != span.elevation)
                        continue;
                    // it's the same elevation, but what if it does not connect to the span?
                    if ((candidate.topY >= activeStrip.bottomY) || (candidate.bottomY < activeStrip.topY))
                        continue;
                    // check if all the rows this strip has can still be extended
                    if ((candidate.bottomY > activeStrip.bottomY) && (activeStrip.bottomY < span.bottomY))
                        continue;
                    if ((candidate.topY < activeStrip.topY) && (activeStrip.topY > span.topY))
                        continue;

                    // by this point, the strip has passed the gauntlet and will be used
                    newStrip = candidate;
                    column.splice(stripIndex, 1); // remove it from column list, it has served its purpose

                    // new rows at the top?
                    if (candidate.topY < activeStrip.topY) {
                        for (y = candidate.topY; y < activeStrip.topY; y++)
                            rows[y] = projectRowAt(columnX, y, span.elevation);
                        span.topY = candidate.topY;
                    }
                    // new rows at the bottom?
                    if (candidate.bottomY > activeStrip.bottomY) {
                        for (y = activeStrip.bottomY; y < candidate.bottomY; y++)
                            rows[y] = projectRowAt(columnX, y, span.elevation);
                        span.bottomY = candidate.bottomY;
                    }

                    // rows to close at the top?
                    if (activeStrip.topY < candidate.topY) {
                        for (y = activeStrip.topY; y < candidate.topY; y++)
                            rows[y].endX = columnX;
                    }
                    // rows to close at the bottom?
                    if (activeStrip.bottomY > candidate.bottomY) {
                        for (y = candidate.bottomY; y < activeStrip.bottomY; y++)
                            rows[y].endX = columnX;
                    }

                    // done!
                    break;
                }

                if (!newStrip) {
                    // no more strips - close off remaining rows
                    for (y = activeStrip.topY; y < activeStrip.bottomY; y++)
                        rows[y].endX = columnX;

                    // clean the 'rows' array up to just the rows that were actually used
                    span.rows = [].concat(rows.slice(span.topY, span.bottomY));

                    // return the finished span!
                    return span;
                } else {
                    // next column, new active strip
                    columnX++;
                    activeStrip = newStrip;
                }
            }
        }

        function projectRowAt(x, y, elevation) {
            // get texturing info
            var unprojected = self.projection.unprojectPoint(pointOfView, x, y, elevation);
            var distancePerPixel = self.projection.width / self.projection.screenWidth;
            var scalingFactor = distancePerPixel * unprojected.playerSpaceZ / self.projection.distance;
            var textureDir = pointOfView.coordinateSpace.x;

            var texturing = {
                u: unprojected.mapped.x % 1, v: unprojected.mapped.y % 1,
                uStep: textureDir.x * scalingFactor, vStep: textureDir.y * scalingFactor
            };

            // light this thing
            var lighting = self.lighting.lightingFactor({x: 0, y: 1}, unprojected.playerSpaceZ, {x: unprojected.playerSpaceZ, y: pointOfView.elevation - elevation});

            // return
            return {
                startX: x, endX: null, // start at 'x', ends who knows where (yet)
                y: y,
                texturing: texturing,
                lighting: lighting
            };
        }

    }
};

// ===============================================================

function LevelRenderer(buffer) {
    this.buffer = buffer;
}
LevelRenderer.prototype = {
    renderSpans: function(spans) {
        var buffer = this.buffer, pixels = buffer.data;

        spans.map(function drawSpan(span) {
            var texture = span.texture;
            var texWidth = texture.width, texHeight = texture.height, tex = texture.pixels;

            span.rows.map(function drawRow(row) {
                var startLoc = buffer.index(row.startX, row.y),
                    endLoc = buffer.index(row.endX, row.y);

                var texSpaceU = row.texturing.u * texture.width, texSpaceV = row.texturing.v * texture.height;
                var wholeU = Math.floor(texSpaceU), uFrac = texSpaceU - wholeU, uStep = row.texturing.uStep * texWidth;
                var wholeV = Math.floor(texSpaceV), vFrac = texSpaceV - wholeV, vStep = row.texturing.vStep * texHeight;
                var texel, r, g, b, steps, updatedUV = false;

                var lighting = row.lighting;

                // calculate pixel color based on texture
                texel = tex[texWidth * wholeU + wholeV];
                r = (texel & 0xff) * lighting;
                g = ((texel >> 8) & 0xff) * lighting;
                b = ((texel >> 16) & 0xff) * lighting;

                // draw!
                for (var loc = startLoc; loc < endLoc; loc++) {
                    // draw current pixel
                    pixels[loc++] = r; pixels[loc++] = g; pixels[loc++] = b;

                    // update u/v
                    updatedUV = false;
                    uFrac += uStep; vFrac += vStep;
                    if (uFrac > 1 || uFrac < 0) {
                        steps = Math.floor(uFrac);
                        wholeU = (wholeU + steps + texWidth) % texWidth;
                        uFrac -= steps;
                        updatedUV = true;
                    }
                    if (vFrac > 1 || vFrac < 0) {
                        steps = Math.floor(vFrac);
                        wholeV = (wholeV + steps + texHeight) % texHeight;
                        vFrac -= steps;
                        updatedUV = true;
                    }

                    // calculate new texel if needed
                    if (updatedUV) {
                        texel = tex[texWidth * wholeU + wholeV];
                        r = (texel & 0xff) * lighting;
                        g = ((texel >> 8) & 0xff) * lighting;
                        b = ((texel >> 16) & 0xff) * lighting;
                    }
                }
            });
        });
    },

    renderWalls: function(view) {
        var buffer = this.buffer;
        var screenWidth = buffer.width;
        var verticalStride = screenWidth * 4 - 3;

        // go through all the columns
        view.map(function(column, x) {
            // and the strips in them
            column.map(function(strip, s) {
                // wall?
                if (strip.kind == S_WALL)
                    drawTexturedStrip(x, strip);
            });
        });

        function drawTexturedStrip(stripX, strip) {
            var texturingInfo = strip.texturing;
            var texture = texturingInfo.texture;
            var lighting = strip.lighting;

            var tex = texture.pixels, buf = buffer.data;

            // calculate starting UV coordinates for texturing
            var texWidth = texture.width, texHeight = texture.height;
            var scaledU = texHeight * frac(texturingInfo.u), scaledV = texWidth * frac(texturingInfo.topV);
            var texU = Math.floor(scaledU), texV = Math.floor(scaledV);
            var texLoc = texU * texWidth + texV;
            var wrapLoc = (texU+1) * texWidth;

            // calculate how fast we should step through the texture (V per screen pixel)
            var texVStep = texture.width * (texturingInfo.bottomV - texturingInfo.topV) / (strip.bottomY - strip.topY);

            // start the counter we will be using to step through texture pixels (counts fractional texels)
            var texFracV = scaledV - texV;

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

                    while(texLoc >= wrapLoc) {
                        texLoc -= texWidth;
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
    this.spansStep = new SpanCollector(this.projection);
    this.drawingStep = new LevelRenderer(this.buffer);
}
Renderer.prototype = {
    renderFrame: function(pointOfView, levelMap) {
        var walls = this.raycastingStep.projectWalls(pointOfView, levelMap);
        var spans = this.spansStep.inferFloorsAndCeilings(pointOfView, walls);

        this.drawingStep.renderWalls(walls);
        this.drawingStep.renderSpans(spans);

        this.buffer.show();
    }
};
