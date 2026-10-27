import { giftSvg } from "@/lib/gift-svg";

// the free-access gift (drawing lives in lib/gift-svg.js, shared with the email image)
export function GiftArt({ className = "", animated = false }) {
  return <span className={`block [&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: giftSvg({ animated }) }} />;
}
