function startDemo() {

    g_resourceManager.addTextures({
        wall: {file: 'assets/wall.png', prerotated: true},
        floor: {file: 'assets/floor.png'},
        ceiling: {file: 'assets/ceiling.png'}
    });
    g_resourceManager.loadEverything()
        .then(function() {
            // prepare everything
            window.g_world = new World(levelData, 10, 10);

            var canvas = document.getElementById('screen');
            var buffer = new Buffer(canvas);
            var projection = new Projection(buffer, 60 /*degrees FOV*/, 2.0 /*projection width in world units*/);
            window.g_renderer = new Renderer(buffer, projection);

            // listen to the user
            g_world.bindEvents();

            // start the show!
            window.requestAnimationFrame(mainLoop);
            function mainLoop() {
                g_world.update();
                g_renderer.renderFrame(g_world.player, g_world.level);

                window.requestAnimationFrame(mainLoop);
            }
        });

}
