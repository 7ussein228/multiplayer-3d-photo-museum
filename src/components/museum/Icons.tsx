import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const base = (props: IconProps) => ({
  width: props.size ?? 18,
  height: props.size ?? 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export function ChatIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z" /></svg>;
}
export function MapIcon(props: IconProps) {
  return <svg {...base(props)}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2zM8 4v13M16 7v13" /></svg>;
}
export function VolumeIcon({ muted, ...props }: IconProps & { muted?: boolean }) {
  return <svg {...base(props)}><path d="M11 5 6 9H3v6h3l5 4z" />{muted ? <path d="m16 9 5 6m0-6-5 6" /> : <><path d="M15 9a4 4 0 0 1 0 6" /><path d="M18 6a8 8 0 0 1 0 12" /></>}</svg>;
}
export function ExpandIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" /></svg>;
}
export function HelpIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1 1-1.1 1.8m0 3.5h.01" /></svg>;
}
export function PlayIcon({ pause, ...props }: IconProps & { pause?: boolean }) {
  return <svg {...base(props)}>{pause ? <path d="M8 5v14M16 5v14" /> : <path d="m8 5 11 7-11 7z" />}</svg>;
}
export function CloseIcon(props: IconProps) {
  return <svg {...base(props)}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
export function ArrowIcon({ left, ...props }: IconProps & { left?: boolean }) {
  return <svg {...base(props)}><path d={left ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>;
}
export function LinkIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></svg>;
}
export function UsersIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></svg>;
}
export function SeatIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M5 11V5a2 2 0 0 1 4 0v6m6 0V5a2 2 0 0 1 4 0v6M4 11h16v5H4zm2 5v4m12-4v4" /></svg>;
}
