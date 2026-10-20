import { useEffect, useRef, useState } from "react";

const PX_PER_SEC = 60;

/**
 * Disruption text running beneath its row, like a board's "calling at" line.
 * It scrolls only when it overflows, pauses on hover/focus or via the board's
 * pause control (WCAG 2.2.2), and sits still under reduced motion.
 */
export function Ticker({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  // undefined = not measured yet (SSR / first paint): one clipped line, no motion.
  const [overflow, setOverflow] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span || typeof ResizeObserver === "undefined") return;
    // Measure the text's natural one-line width (an off-flow clone), not its wrapped box.
    const probe = span.cloneNode(true) as HTMLSpanElement;
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0";
    box.appendChild(probe);
    const measure = () => {
      const width = probe.getBoundingClientRect().width;
      setOverflow(width > box.clientWidth ? width : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, [text]);

  const style = overflow ? ({ "--ticker-duration": `${Math.max(12, (overflow + 64) / PX_PER_SEC)}s` } as React.CSSProperties) : undefined;
  const className = overflow === undefined ? "ticker ticker--measuring" : overflow ? "ticker" : "ticker ticker--static";
  return (
    <div className={className} style={style}>
      <div className="ticker__window" ref={boxRef}>
        <div className="ticker__track">
          <span ref={textRef}>{text}</span>
          <span className="ticker__copy" aria-hidden="true">{text}</span>
        </div>
      </div>
    </div>
  );
}
