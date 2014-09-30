var startDemo = function() {

	// ====================================================================

	return function() {
		var world = new World(levelData, 10, 10);
		var renderer = new Renderer(document.getElementById('screen'));

        world.bindEvents();

        requestAnimationFrame(nextFrame);
		
		function nextFrame() {
			world.update();
			renderer.renderFrame(world.player, world.level);
			
			requestAnimationFrame(nextFrame);
		}
	}
}();
