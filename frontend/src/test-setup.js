import '@testing-library/jest-dom';
// jsdom doesn't implement ResizeObserver; cmdk uses it internally
globalThis.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};
// jsdom doesn't implement scrollIntoView; cmdk uses it for keyboard navigation
window.HTMLElement.prototype.scrollIntoView = function () { };
