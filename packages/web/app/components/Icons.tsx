// One drawn icon set: 16px grid, 1.5 stroke, round caps. Decorative by default.
interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return <Svg {...props}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
}

export function SearchIcon(props: IconProps) {
  return <Svg {...props}><circle cx="7" cy="7" r="4.25" /><path d="M10.25 10.25L13.5 13.5" /></Svg>;
}

export function ChevronIcon(props: IconProps) {
  return <Svg className="chevron" {...props}><path d="M4 6l4 4 4-4" /></Svg>;
}

export function AlertIcon(props: IconProps) {
  return <Svg {...props}><path d="M8 2.5l6 11H2l6-11z" /><path d="M8 6.75v3" /><path d="M8 11.75v.01" /></Svg>;
}

export function PauseIcon(props: IconProps) {
  return <Svg {...props}><path d="M6 4v8M10 4v8" /></Svg>;
}

export function PlayIcon(props: IconProps) {
  return <Svg {...props}><path d="M5.5 3.75v8.5L12 8 5.5 3.75z" /></Svg>;
}
