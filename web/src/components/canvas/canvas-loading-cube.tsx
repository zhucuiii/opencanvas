import "./canvas-loading-cube.css";

/**
 * Ported 1:1 from uiverse.io/bociKond/wise-bat-13: a wireframe cube drawn as six
 * absolutely positioned faces inside a `preserve-3d` box, tumbling on a 1.6s
 * loop — first a full flip around X, then a full spin around Y.
 *
 * The reference hard-codes its cream colour (`rgb(247,197,159)`) for both the
 * edges and the 10%-alpha fill; here both derive from `currentColor`, so the
 * cube follows the canvas theme.
 */
export function CanvasLoadingCube({ color }: { color: string }) {
    return (
        <div className="canvas-loading-cube" style={{ color }} aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
        </div>
    );
}