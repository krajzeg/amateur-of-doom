// Hardcoded level data
var floorData =
    "##########" +
    "#   #    #" +
    "#        #" +
    "#      # #" +
    "#        #" +
    "#  # ... #" +
    "#  #     #" +
    "#  # vvv #" +
    "#  #     #" +
    "##########";

var ceilingData =
    "          " +
    "          " +
    "          " +
    "          " +
    "          " +
    "          " +
    "          " +
    "          " +
    "          " +
    "          ";

// ====================================================================

function Level(floorData, ceilingData, levelWidth, levelHeight) {
    var len = floorData.length;
    var floors = new Array(len);
    var ceilings = new Array(len);

    var tWall = g_resourceManager.texture('wall'),
        tFloor = g_resourceManager.texture('floor'),
        tCeiling = g_resourceManager.texture('ceiling');

    for (var i = 0; i < len; i++) {
        var ceiling, floor;
        switch(ceilingData.charAt(i)) {
            case ' ': ceiling = {elevation: -0.5, wallTexture: tCeiling, flatTexture: tCeiling}; break;
        }
        ceilings[i] = ceiling;

        switch(floorData.charAt(i)) {
            case ' ': floor = {elevation: 1, wallTexture: tFloor, flatTexture: tFloor}; break;
            case '.': floor = {elevation: 0.875, wallTexture: tFloor, flatTexture: tFloor}; break;
            case 'v': floor = {elevation: 1.125, wallTexture: tFloor, flatTexture: tCeiling}; break;
            case '#': floor = {elevation: ceiling.elevation, wallTexture: tWall, flatTexture: tFloor}; break;
        }
        floors[i] = floor;
    }

    // store for later
    _.extend(this, {
        width: levelWidth,
        height: levelHeight,
        floors: floors,
        ceilings: ceilings
    });
}
Level.prototype = {
    floor: function(x, y) {
        return this.floors[y * this.width + x];
    },

    ceiling: function(x, y) {
        return this.ceilings[y * this.width + x];
    },

    floorAt: function(v) {
        v = Vec.integer(v);
        return this.floors[v.y * this.width + v.x];
    },

    ceilingAt: function(v) {
        v = Vec.integer(v);
        return this.ceilings[v.y * this.width + v.x];
    }
};

// ====================================================================

var PLAYER_RADIUS = 0.3,
    PLAYER_MOVEMENT_SPEED = 0.1,
    PLAYER_SCALING_HEIGHT = 0.2;

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
            return (self.floor - level.floorAt(pos).elevation > PLAYER_SCALING_HEIGHT);
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
        var floorHeight = this.world.level.floorAt(this).elevation;
        this.floor = floorHeight;
        this.elevation = floorHeight - 0.5;

        // update coordinate space
        var playerZ = Vec.fromBearing(this.bearing);
        var playerX = Vec.rotate90Clockwise(playerZ);
        this.coordinateSpace = {z: playerZ, x: playerX};
    }
};

// ====================================================================

function World(floorData, ceilingData, levelWidth, levelHeight) {
    this.level = new Level(floorData, ceilingData, levelWidth, levelHeight);
    this.player = new Player(this, {x: 4, y: 4, elevation: 0.5, bearing: 29});
    this.update();
}
World.prototype = {
    update: function() {
        this.player.update();
    }
};
