// Hardcoded level data
var levelData =
    "##########" +
    "#   #    #" +
    "#        #" +
    "#      # #" +
    "#        #" +
    "#  # #####" +
    "#  #     #" +
    "#  #     #" +
    "#  #     #" +
    "##########";

// ====================================================================

function World(levelData, levelWidth, levelHeight) {
    this.player = {x: 4, y: 4, elevation: 0.5, bearing: 29};
    this.level = this.parseLevel(levelData, levelWidth, levelHeight);
    this.keyState = {};
    this.update();
}
World.prototype = {
    parseLevel: function(levelData, levelWidth, levelHeight) {
        var cells = new Array(levelData.length);

        var tWall = g_resourceManager.texture('wall');

        for (var i = 0; i < levelData.length; i++) {
            switch(levelData.charAt(i)) {
                case ' ': cells[i] = {floor: 1, ceiling: 0}; break;
                case '#': cells[i] = {floor: 0, ceiling: 0, wallTexture: tWall}; break;
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

        var playerZ = Vec.fromBearing(this.player.bearing);
        var playerX = Vec.rotate90Clockwise(playerZ);

        this.player.coordinateSpace = {z: playerZ, x: playerX};
    }
};
