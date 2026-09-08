import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  alternates: { canonical: "/settings" },
};

const SettingsLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <>{children}</>;
};

export default SettingsLayout;
