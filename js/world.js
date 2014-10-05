// Hardcoded level data
var levelData =
    "##########" +
    "#   #    #" +
    "#        #" +
    "#      # #" +
    "#        #" +
    "#  # #####" +
    "#  #     #" +
    "#  # ... #" +
    "#  #     #" +
    "##########";

// ====================================================================

function Level(levelData, levelWidth, levelHeight) {
    var cells = new Array(levelData.length);

    var tWall = g_resourceManager.texture('wall'),
        tFloor = g_resourceManager.texture('floor');

    for (var i = 0; i < levelData.length; i++) {
        switch(levelData.charAt(i)) {
            case ' ': cells[i] = {floor: 1, ceiling: -0.5}; break;
            case '.': cells[i] = {floor: 0.875, ceiling: -0.5, wallTexture: tFloor}; break;
            case 'v': cells[i] = {floor: 1.125, ceiling: -0.5, wallTexture: tFloor}; break;
            case '#': cells[i] = {floor: -0.5, ceiling: -0.5, wallTexture: tWall}; break;
        }
    }

    // store for later
    _.extend(this, {
        width: levelWidth,
        height: levelHeight,
        cells: cells
    });
}
Level.prototype = {
    cell: function(x, y) {
        return this.cells[y * this.width + x];
    },

    cellAtVector: function(v) {
        v = Vec.integer(v);
        return this.cells[v.y * this.width + v.x];
    }
};

// ====================================================================

var PLAYER_RADIUS = 0.3, PLAYER_MOVEMENT_SPEED = 0.1;

function Player(world, properties) {
    this.world = world;
    _.extend(this, properties);
}
Player.prototype = {
    move: function(x, z) {
        var self = this;

        // move in the right direction
        var delta = Vec.add(Vec.mul(this.coordinateSpace.z, z), Vec.mul(this.coordinateSpace.x, x));
        var newPos = Vec.add(this, delta);

        // kick the player out of any walls
        var level = this.world.level;

        var right = Vec.add(newPos, {x: PLAYER_RADIUS, y: 0});
        if (isInAWall(right))
            newPos.x = Math.floor(right.x) - PLAYER_RADIUS;

        var left = Vec.add(newPos, {x: -PLAYER_RADIUS, y: 0});
        if (isInAWall(left))
            newPos.x = Math.ceil(left.x) + PLAYER_RADIUS;

        var up = Vec.add(newPos, {x: 0, y: -PLAYER_RADIUS});
        if (isInAWall(up))
            newPos.y = Math.ceil(up.y) + PLAYER_RADIUS;

        var down = Vec.add(newPos, {x: 0, y: PLAYER_RADIUS});
        if (isInAWall(down))
            newPos.y = Math.floor(down.y) - PLAYER_RADIUS;

        this.x = newPos.x; this.y = newPos.y;

        function isInAWall(pos) {
            return (self.floor > level.cellAtVector(pos).floor);
        }
    },

    handleInput: function() {
        if (g_input.left) this.move(-PLAYER_MOVEMENT_SPEED, 0);
        if (g_input.right) this.move(PLAYER_MOVEMENT_SPEED, 0);
        if (g_input.forward) this.move(0, PLAYER_MOVEMENT_SPEED);
        if (g_input.back) this.move(0, -PLAYER_MOVEMENT_SPEED);

        this.bearing += g_input.rotation.x;
    },

    update: function() {
        // respond to input
        this.handleInput();

        // update elevation
        var gridPosition = Vec.integer(this);
        var floorHeight = this.world.level.cell(gridPosition.x, gridPosition.y).floor;
        this.floor = floorHeight;
        this.elevation = floorHeight - 0.5;

        // update coordinate space
        var playerZ = Vec.fromBearing(this.bearing);
        var playerX = Vec.rotate90Clockwise(playerZ);
        this.coordinateSpace = {z: playerZ, x: playerX};
    }
};

// ====================================================================

function World(levelData, levelWidth, levelHeight) {
    this.level = new Level(levelData, levelWidth, levelHeight);
    this.player = new Player(this, {x: 4, y: 4, elevation: 0.5, bearing: 29});
    this.update();
}
World.prototype = {
    update: function() {
        this.player.update();
    }
};
