import "./motion.css";
/** A response bubble with an R-shaped path, shared by every brand placement. */
export function LogoMark() {
  return (
    <svg
      className="logo-mark"
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="logo-tile"
        d="M10 2h16a8 8 0 0 1 8 8v15a8 8 0 0 1-8 8H14l-8 2v-6a8 8 0 0 1-4-7V10a8 8 0 0 1 8-8Z"
        fill="#1c3c50"
      />
      <path
        className="logo-stroke"
        d="M11 25V10h9a5 5 0 0 1 0 10h-9m8 0 6 6"
        stroke="#f5f8fa"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="logo-dot" cx="28" cy="8" r="2" fill="#9ebccc" />
    </svg>
  );
}
