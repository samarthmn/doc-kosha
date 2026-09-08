import React from "react";

const AppBackground: React.FC = () => {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-80 overflow-hidden transition-colors duration-200"
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--dk-rule-fade)]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_7%,transparent),transparent_68%)]" />
    </div>
  );
};

export default AppBackground;
