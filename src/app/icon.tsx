import Logo from "@/components/ui/logo";
import { ImageResponse } from "next/og";

export const size = {
  width: 260,
  height: 260,
};

export const contentType = "image/png";

const Icon = () => new ImageResponse(<Logo {...size} color="#fff" />, size);

export default Icon;
