var startDemo = function() {
	// ====================================================================

	var S_FLOOR = 'floor', S_CEILING = 'ceiling', S_WALL = 'wall', S_END = 'end';
	var WD_HORIZONTAL = 'h', WD_VERTICAL = 'v';

	// ====================================================================

	var levelData =
		"##########" +
		"#     #  #" +
		"#      # #" +
		"#        #" +
		"#        #" +
		"#  # #####" +
		"#  #     #" +
		"#  #     #" +
		"#  #     #" +
		"##########";

	// ====================================================================

	function deg2rad(degrees) {
		return degrees / 180.0 * Math.PI;
	}

	// ====================================================================

	function GameState(levelData, levelWidth, levelHeight) {
		this.player = {x: 4.5, y: 4.5, elevation: 0.5, bearing: 45};
		this.level = this.parseLevel(levelData, levelWidth, levelHeight);
		this.keyState = {};
	}
	GameState.prototype = {
		parseLevel: function(levelData, levelWidth, levelHeight) {
			var cells = new Array(levelData.length);
			
			for (i = 0; i < levelData.length; i++) {
				switch(levelData.charAt(i)) {
					case ' ': cells[i] = {floor: 0, ceiling: 1}; break;
					case '#': cells[i] = {floor: 1, ceiling: 1}; break;
				}
			}

			return {
				width: levelWidth,
				height: levelHeight,
				cells: cells
			}
		},

		bindEvents: function() {
			var self = this;
			window.onkeydown = handler.bind(null, true);
			window.onkeyup   = handler.bind(null, false);
				
			function handler(state, evt) {
				self.keyState[String.fromCharCode(evt.which)] = state;
			}
		},

		update: function() {
			if (this.keyState['A']) this.player.bearing -= 3.0;
			if (this.keyState['D']) this.player.bearing += 3.0;

			if (this.keyState['W'] || this.keyState['S']) {				
				var angle = deg2rad(this.player.bearing);
				var dir = {x: Math.sin(angle), y: -Math.cos(angle)};
				var moveSpeed = 0.25 * ((this.keyState['W'] ? 1 : 0) + (this.keyState['S'] ? -1 : 0));

				this.player.x += dir.x * moveSpeed; 
				this.player.y += dir.y * moveSpeed;
			}
		}
	}

	// ====================================================================

	function Renderer(canvas) {
		this.setup(canvas);
	}
	Renderer.prototype = {
		setup: function(canvas) {
			this.canvas = canvas;
			this.context = canvas.getContext('2d');
			this.buffer = this.setupBuffer();	

			this.fov = deg2rad(60);
			this.projectionDistance = 1.0 / Math.tan(this.fov / 2);
			this.projectionWidth = 1.0;
			this.projectionHeight = 1.0 * canvas.height / canvas.width;						
		},

		setupBuffer: function() {
			// create a fullscreen buffer
			var buffer = this.context.createImageData(this.canvas.width, this.canvas.height);
			
			// set alpha to 255 for the rest of eternity
			var data = buffer.data;
			for (var i = 3; i < data.length; i += 4)
				data[i] = 255;

			// return the buffer
			return buffer;
		},

		clearBuffer: function() {
			var data = this.bufferData();
			// reset RGB values, leave alpha alone
			for (var i = 0; i < data.length; i++) {
				data[i++] = 0; data[i++] = 0; data[i++] = 0;
			}
		},

		renderFrame: function(gameState) {		
			// prepare some constants for later
			var self = this;
			var canvas = this.canvas, buf = this.bufferData();
			var width = this.canvas.width, height = this.canvas.height,
				centerX = width / 2, centerY = height / 2,
				maxX = width-1, maxY = height-1;

			var fieldOfView = self.fov;
			var projectionDistance = self.projectionDistance;
			var projectionHeight = self.projectionHeight;

			// clean up
			this.clearBuffer();
			
			// prepare our internal representation using raycasting
			var columns = raycastColumns();

			// draw the representation onto the buffer
			drawColumns(columns);

			// 'flip' the buffer!
			this.context.putImageData(this.buffer, 0, 0);


			function raycastColumns() {
				var columns = new Array(width), column;
				var rayOrigin = gameState.player;
				var eyeAngle = deg2rad(gameState.player.bearing);

				// go through all the columns in the screen
				for (var rx = 0; rx < width; rx++) {
					// every column starts with just the floor and ceiling
					column = [
						{kind: S_CEILING, topY: 0},
						{kind: S_FLOOR, topY: centerY},						
						{kind: S_END, topY: height} // sentinel value for simplifying various algorithms
					];			

					// look for the wall
					var rayAngle = eyeAngle + (rx / width - 0.5) * fieldOfView; // TODO: seven kinds of wrong
					var intersection = castRayAndReturnIntersections(rayOrigin, rayAngle);	

					// project the wall strip
					var z = zDistance(rayOrigin, eyeAngle, rayAngle, intersection.intersectedAt);
					var wall = projectWall(-0.5, 0.5, z);
					
					// insert the new strip, along with metadata
					wall.kind = S_WALL;
					wall.color = intersection.wallDirection == WD_HORIZONTAL ? [255, 200, 200] : [200, 200, 255];					
					insertStrip(column, wall);

					// store the finished column
					columns[rx] = column;
				}

				return columns;
			}			

			function castRayAndReturnIntersections(origin, angle) {
				var cells = gameState.level.cells, lW = gameState.level.width;

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
							withCell: cell
						};
					}
				}
			}

			function insertStrip(strips, newStrip) {
				for (var i = 1; ; i++) {
					var nextStrip = strips[i];
					if (nextStrip.topY > newStrip.topY) {
						// insert here
						strips.splice(i, 0, newStrip);
						// fix up the next strip's top to our bottom
						nextStrip.topY = newStrip.bottomY;
						delete newStrip.bottomY; // remove as no longer needed
						return;
					}
				}
			}

			function zDistance(rayOrigin, eyeAngle, rayAngle, rayIntersection) {				
				var distanceVec = {x: rayIntersection.x - rayOrigin.x, y: rayIntersection.y - rayOrigin.y}; // this is straight-line distance
				var distance = Math.sqrt(distanceVec.x * distanceVec.x + distanceVec.y * distanceVec.y);
				return distance * Math.cos(eyeAngle - rayAngle);
			}

			function projectWall(relativeTop, relativeBottom, zDistance) {							
				// scale according to Z distance
				var scalingFactor = projectionDistance / zDistance;
				var top = (0.5 + relativeTop * scalingFactor) * height;
				var bottom = (0.5 + relativeBottom * scalingFactor) * height;
				if (top < 0) top = 0;
				if (bottom > height) bottom = height;
				
				return {topY: Math.round(top), bottomY: Math.round(bottom)};
			}


			function drawColumns(columns) {
				// go through all the columns
				columns.map(function(column, x) {
					// and the strips in them
					column.map(function(strip, s) {
						if (strip.kind == S_END) return;

						// calculate locations in the buffer where the strip starts/ends
						var nextStrip = column[s+1];						
						var startLoc = (strip.topY * width + x) * 4, 
						    endLoc = (nextStrip.topY * width + x) * 4,
						    stride = width * 4 - 3;

						// pick color based on strip type
						var r, g, b;
						switch(strip.kind) {
							case S_FLOOR:    r = g = b = 100; break;
							case S_CEILING:  r = g = b = 50; break;
							default:
								r = strip.color[0]; g = strip.color[1]; b = strip.color[2];
						}

						// draw a vertical uniform strip in the buffer
						for (var loc = startLoc; loc < endLoc; loc += stride) {
							buf[loc++] = r; buf[loc++] = g; buf[loc++] = b;
						}
					});
				})
			}
		},

		bufferData: function() { return this.buffer.data; }
	}

	// ====================================================================

	return function() {
		var gameState = new GameState(levelData, 10, 10);
		gameState.bindEvents();
		var renderer = new Renderer(document.getElementById('screen'));

		requestAnimationFrame(nextFrame);
		
		function nextFrame() {
			gameState.update();
			renderer.renderFrame(gameState);
			
			requestAnimationFrame(nextFrame);
		}
	}
}();
