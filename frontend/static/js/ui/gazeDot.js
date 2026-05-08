export class GazeDot {
    #el;

    constructor(elementId = 'gaze-dot') {
        this.#el = document.getElementById(elementId);
    }

    show(x, y) {
        if (!this.#el) return;
        this.#el.style.display = 'block';
        this.#el.style.left    = `${x}px`;
        this.#el.style.top     = `${y}px`;
    }

    hide() {
        if (this.#el) this.#el.style.display = 'none';
    }
}
