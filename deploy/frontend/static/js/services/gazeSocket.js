const _EMA_ALPHA = 0.25; // 낮을수록 부드럽고 느림, 높을수록 빠르고 떨림

export class GazeSocket {
    #ws = null;
    #sx = null;
    #sy = null;

    connect() {
        this.#ws = new WebSocket('ws://localhost:8765/ws');
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
            this.#sx = this.#sx === null ? data.x : _EMA_ALPHA * data.x + (1 - _EMA_ALPHA) * this.#sx;
            this.#sy = this.#sy === null ? data.y : _EMA_ALPHA * data.y + (1 - _EMA_ALPHA) * this.#sy;
            window.dispatchEvent(
                new CustomEvent('gaze:tracking', { detail: { x: this.#sx, y: this.#sy } })
            );
        } else if (data.type === 'gaze' && !data.calibrated) {
            this.#sx = this.#sy = null;
            window.dispatchEvent(new CustomEvent('gaze:detected'));
        } else if (data.type === 'no_face') {
            this.#sx = this.#sy = null;
            window.dispatchEvent(new CustomEvent('gaze:lost'));
        }
    }
}
