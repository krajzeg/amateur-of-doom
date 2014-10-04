INPUT_MAPPINGS = {
    'W': 'forward',
    'S': 'back',
    'A': 'left',
    'D': 'right',
    ' ': 'jump'
};

function Input() {
    this.locked = false;
    this.rotation = {x: 0, y: 0};
}
Input.prototype = {
    bindEvents: function(mouseElement) {
        var self = this;

        // keyboard events
        window.onkeydown = handler.bind(null, true);
        window.onkeyup   = handler.bind(null, false);

        function handler(state, evt) {
            var char = String.fromCharCode(evt.which);
            var mapping = INPUT_MAPPINGS[char];

            if (mapping)
                self[mapping] = state;
        }

        // mouse controls
        mouseElement.addEventListener('click', function(evt) {
            mouseElement.requestPointerLock();
        });
        document.addEventListener('pointerlockchange', function(evt) {
            self.locked = document.pointerLockElement == mouseElement;
        });
        document.addEventListener('mousemove', function(evt) {
            if (self.locked)
                self.rotation = {x: evt.movementX, y: evt.movementY};
        });
    },

    /**
     * Resets the input object for next frame.
     */
    reset: function() {
        this.rotation = {x: 0, y: 0};
    }
};
