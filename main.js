function startDemo() {
    var world = new World(levelData, 10, 10);

    var canvas = document.getElementById('screen');
    var buffer = new Buffer(canvas);
    var projection = new Projection(buffer, 60 /*degrees FOV*/, 2.0 /*projection width in world units*/);
    var renderer = new Renderer(buffer, projection);

    world.bindEvents();

    window.requestAnimationFrame(nextFrame);

    function nextFrame() {
        world.update();
        renderer.renderFrame(world.player, world.level);

        window.requestAnimationFrame(nextFrame);
    }
}
