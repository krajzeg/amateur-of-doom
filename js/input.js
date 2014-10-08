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
            if (self.locked) {
                var char = String.fromCharCode(evt.which);
                var mapping = INPUT_MAPPINGS[char];

                if (mapping) {
                    self[mapping] = state;
                    return false;
                }
            }
        }

        // compatibility with various browsers
        var requestPointerLock = mouseElement.requestPointerLock ||
            mouseElement.mozRequestPointerLock ||
            mouseElement.webkitRequestPointerLock;
        if (!requestPointerLock) {
            window.alert("Your browser doesn't support locking the mouse pointer.");
            return;
        }
        requestPointerLock = requestPointerLock.bind(mouseElement);

        // mouse controls
        mouseElement.addEventListener('click', function(evt) {
            requestPointerLock();
        });
        ['pointerlockchange', 'webkitpointerlockchange', 'mozpointerlockchange'].map(function(eventName) {
            document.addEventListener(eventName, function(_) {
                var element = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
                self.locked = !!element;
                if (self.locked)
                    self.gracePeriod = 1;
            });
        });
        document.addEventListener('mousemove', function(evt) {
            if (self.locked && (!self.gracePeriod)) {
                var x = evt.movementX || evt.mozMovementX || evt.webkitMovementX || 0;
                var y = evt.movementY || evt.mozMovementY || evt.webkitMovementY || 0;
                self.rotation = {x: x, y: y};
            }
        });
    },

    /**
     * Resets the input object for next frame.
     */
    reset: function() {
        this.rotation = {x: 0, y: 0};
        if (this.gracePeriod)
            this.gracePeriod--;
    }
};
