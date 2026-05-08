export class GazeSocket {
    #ws = null;

    connect() {
        this.#ws = new WebSocket(`ws://${location.host}/ws`);
        this.#ws.onopen    = () => console.log('[GazeSocket] 연결됨');
        this.#ws.onmessage = (e) => this.#dispatch(JSON.parse(e.data));
        this.#ws.onerror   = () => console.error('[GazeSocket] 연결 실패. 서버가 실행 중인지 확인하세요.');
        this.#ws.onclose   = () => window.dispatchEvent(new CustomEvent('gaze:lost'));
    }

    disconnect() {
        this.#ws?.close();
    }

    #dispatch(data) {
        if (data.type === 'gaze' && data.calibrated) {
            window.dispatchEvent(
                new CustomEvent('gaze:tracking', { detail: { x: data.x, y: data.y } })
            );
        } else if (data.type === 'gaze' && !data.calibrated) {
            window.dispatchEvent(new CustomEvent('gaze:detected'));
        } else if (data.type === 'no_face') {
            window.dispatchEvent(new CustomEvent('gaze:lost'));
        }
    }
}
