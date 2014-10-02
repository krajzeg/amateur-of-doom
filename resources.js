function Texture(description) {
    this.fileName = description.file;
    this.prerotated = !!description.prerotated;
}
Texture.prototype = {
    load: function() {
        var self = this;
        return Q.promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() {
                self.extractTextureData(img);
                resolve(self);
            };
            img.src = self.fileName;
        });
    },

    extractTextureData: function(loadedImage) {
        // width and height
        this.width = loadedImage.width;
        this.height = loadedImage.height;

        // create a temporary canvas to extract image data with
        var canvas = document.createElement('canvas');
        canvas.width = loadedImage.width;
        canvas.height = loadedImage.height;
        var context = canvas.getContext('2d');

        // draw onto the canvas and get the buffer
        if (this.prerotated) {
            // for wall textures, we draw the image rotated and flipped to allow us to use
            // horizontal lines during texturing (the CPU cache is much happier then!)
            context.rotate(-Math.PI / 2);
            context.scale(-1, 1);
        }
        context.drawImage(loadedImage, 0, 0);
        this.pixels = new Uint32Array(context.getImageData(0, 0, this.width, this.height).data.buffer);
    }
};

// ========================================================

function ResourceManager() {
    this.texturesToLoad = {};
    this.textures = {};
}
ResourceManager.prototype = {
    addTextures: function(textures) {
        this.texturesToLoad = _.extend(this.texturesToLoad, textures);
    },

    loadEverything: function() {
        var self = this;
        return Q.all(_.map(self.texturesToLoad, function(description, textureName) {
            var texture = new Texture(description);
            self.textures[textureName] = texture;
            return texture.load();
        }));
    },

    texture: function(name) {
        return this.textures[name];
    }
};

// resource manager is used as a global
var g_resourceManager = new ResourceManager();