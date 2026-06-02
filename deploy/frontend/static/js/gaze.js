import { GazeSocket }  from './services/gazeSocket.js';
import { GazeDot }     from './ui/gazeDot.js';
import { GazeWidget }  from './ui/widget.js';

const dot    = new GazeDot('gaze-dot');
const widget = new GazeWidget();
const socket = new GazeSocket();

widget.init();
socket.connect();

window.addEventListener('gaze:tracking', ({ detail: { x, y } }) => {
    dot.show(x, y);
    widget.updateStatus('tracking');
});

window.addEventListener('gaze:detected', () => {
    widget.updateStatus('detected');
});

window.addEventListener('gaze:lost', () => {
    dot.hide();
    widget.updateStatus('lost');
});
