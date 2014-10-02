function startDemo() {

    g_resourceManager.addTextures({
        wall: {file: 'assets/wall64.png', prerotated: true},
        floor: {file: 'assets/floor64.png'}
    });
    g_resourceManager.loadEverything()
        .then(function() {
            // prepare everything
            var world = new World(levelData, 10, 10);

            var canvas = document.getElementById('screen');
            var buffer = new Buffer(canvas);
            var projection = new Projection(buffer, 60 /*degrees FOV*/, 2.0 /*projection width in world units*/);
            var renderer = new Renderer(buffer, projection);

            // listen to the user
            world.bindEvents();

            // start the show!
            window.requestAnimationFrame(mainLoop);
            function mainLoop() {
                world.update();
                renderer.renderFrame(world.player, world.level);

                window.requestAnimationFrame(mainLoop);
            }
        });

}
